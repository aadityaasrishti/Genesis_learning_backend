const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { prisma } = require("../config/prisma");
const {
  authMiddleware,
  adminCheck,
  adminstaffCheck,
} = require("../middleware/authMiddleware");
const cleanupNotifications = require("../scripts/cleanupNotifications");
const { createOTP, sendEmailOTP, sendMobileOTP, verifyOTP } = require("../utils/otpUtils");

// Create system notification helper function
const createSystemNotification = async (prisma, userId, message) => {
  await prisma.notification.create({
    data: {
      user_id: userId,
      message,
      type: "system",
    },
  });
};

// Create notification for admins helper function
const notifyAdmins = async (prisma, message) => {
  const admins = await prisma.user.findMany({
    where: {
      role: "admin",
      is_active: true,
    },
    select: {
      user_id: true,
    },
  });

  if (admins.length > 0) {
    await prisma.notification.createMany({
      data: admins.map((admin) => ({
        user_id: admin.user_id,
        message,
        type: "system", // Added missing type field
      })),
    });
  }
};

// Generate OTP for email/mobile verification
router.post("/generate-otp", async (req, res) => {
  try {
    const { identifier, type } = req.body;

    if (!identifier || !type) {
      return res.status(400).json({ message: "Identifier and type are required" });
    }

    if (!["EMAIL", "MOBILE"].includes(type)) {
      return res.status(400).json({ message: "Invalid OTP type" });
    }

    // For email type, validate email format
    if (type === "EMAIL") {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(identifier)) {
        return res.status(400).json({ message: "Invalid email format" });
      }

      // Check if email already exists
      const existingUser = await prisma.user.findUnique({ where: { email: identifier } });
      if (existingUser) {
        return res.status(400).json({ message: "Email already registered" });
      }
    }

    // For mobile type, validate mobile format (assuming 10 digits)
    if (type === "MOBILE") {
      const mobileRegex = /^\d{10}$/;
      if (!mobileRegex.test(identifier)) {
        return res.status(400).json({ message: "Invalid mobile number format" });
      }

      // Check if mobile already exists
      const existingUser = await prisma.user.findFirst({ where: { mobile: identifier } });
      if (existingUser) {
        return res.status(400).json({ message: "Mobile number already registered" });
      }
    }

    const otp = await createOTP(identifier, type);

    // Send OTP based on type
    if (type === "EMAIL") {
      await sendEmailOTP(identifier, otp);
    } else {
      await sendMobileOTP(identifier, otp);
    }

    res.json({ message: "OTP sent successfully" });
  } catch (err) {
    console.error("OTP generation error:", err);
    res.status(500).json({ message: err.message });
  }
});

// Verify OTP
router.post("/verify-otp", async (req, res) => {
  try {
    const { identifier, type, code } = req.body;

    if (!identifier || !type || !code) {
      return res.status(400).json({ message: "Identifier, type and code are required" });
    }

    const isValid = await verifyOTP(identifier, type, code);
    if (!isValid) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    res.json({ message: "OTP verified successfully" });
  } catch (err) {
    console.error("OTP verification error:", err);
    res.status(500).json({ message: err.message });
  }
});

// Register route
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, mobile, role, emailOTP, class: className, subjects, guardian_name, guardian_mobile } = req.body;

    // Validate required fields
    const requiredFields = ["name", "email", "password", "mobile", "role"];
    const missingFields = requiredFields.filter(field => !req.body[field]);

    if (missingFields.length > 0) {
      console.log("Missing required fields:", missingFields);
      return res.status(400).json({
        message: `Required fields are missing: ${missingFields.join(", ")}`,
        missingFields,
      });
    }

    // Verify email OTP
    const emailVerified = await verifyOTP(email, "EMAIL", emailOTP);
    if (!emailVerified) {
      return res.status(400).json({
        message: "Invalid or expired OTP. Please verify your email again.",
        invalidOTP: "email"
      });
    }

    // Check if user exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists with this email" });
    }

    // Validate mobile number format
    const mobileRegex = /^\d{10}$/;
    if (!mobileRegex.test(mobile)) {
      return res.status(400).json({ message: "Mobile number must be exactly 10 digits" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user with role and additional fields
    const userData = {
      email,
      password: hashedPassword,
      name,
      mobile,
      role,
      class: className,
      subjects,
      requested_class: className, // Initialize with the same value as class
      requested_subjects: subjects, // Initialize with the same value as subjects
      guardian_name,
      plan_status: "demo", // Default to demo status for new users
      demo_user_flag: true, // Default to true for new users
      is_active: true,
    };

    console.log("Creating user with data:", {
      ...userData,
      password: "[HIDDEN]",
    });

    const user = await prisma.user.create({
      data: userData,
    });

    console.log("User created successfully:", { userId: user.user_id, role });

    // Create role-specific record
    try {
      if (role === "teacher") {
        await prisma.teacher.create({
          data: {
            user_id: user.user_id,
            subject: subjects,
            class_assigned: className,
            mobile,
          },
        });
      } else if (role === "student") {
        await prisma.student.create({
          data: {
            user_id: user.user_id,
            class_id: className,
            mobile,
            guardian_name,
            guardian_mobile: guardian_mobile || mobile, // Use provided guardian mobile or user's mobile
            enrollment_date: new Date(),
          },
        });
      } else if (role === "support_staff") {
        await prisma.adminSupportStaff.create({
          data: {
            user_id: user.user_id,
            department: "General", // Default department
            salary: 0, // Default salary
            mobile,
          },
        });
      }
      
      // Create welcome notification for the new user
      await prisma.notification.create({
        data: {
          user_id: user.user_id,
          message: `Welcome to the system! Your account has been created successfully as a ${role}.`,
          type: "system",
        },
      });

      // Notify admins about new user registration
      const admins = await prisma.user.findMany({
        where: {
          role: "admin",
          is_active: true,
        },
        select: {
          user_id: true,
        },
      });

      if (admins.length > 0) {
        await prisma.notification.createMany({
          data: admins.map((admin) => ({
            user_id: admin.user_id,
            message: `New ${role} registered: ${name} (ID: ${user.user_id})`,
            type: "system",
          })),
        });
      }

      console.log("Role-specific record created successfully");
    } catch (roleError) {
      // If role-specific creation fails, delete the user and throw error
      await prisma.user.delete({ where: { user_id: user.user_id } });
      console.error("Role-specific creation failed:", roleError);
      throw new Error(`Failed to create ${role} record: ${roleError.message}`);
    }

    res.status(201).json({
      message: "User registered successfully",
      userId: user.user_id,
    });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({
      message: err.message || "Failed to register user",
      error: err.message,
    });
  }
});

// Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!(email && password)) {
      return res
        .status(400)
        .json({ message: "Email and password are required" });
    }

    // Find user
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // Update last login
    await prisma.user.update({
      where: { user_id: user.user_id },
      data: { last_login: new Date() },
    });

    // Create token with user role
    const token = jwt.sign(
      { user_id: user.user_id, email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(200).json({ token });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get current user
router.get(
  "/me",
  authMiddleware(["admin", "teacher", "student", "support_staff"]),
  async (req, res) => {
    try {
      const user = await prisma.user.findUnique({
        where: { user_id: req.user.user_id },
        include: {
          student: true,
          teacher: true,
          adminSupportStaff: true,
        },
      });

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Format response with explicit class and subject information
      const response = {
        ...user,
        password: undefined, // Remove sensitive data
        class:
          user.role === "student"
            ? user.student?.class_id || user.class
            : user.teacher?.class_assigned || user.class,
        subjects:
          user.role === "student"
            ? user.student?.subjects || user.subjects
            : user.teacher?.subject || user.subjects,
      };

      res.json(response);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ error: "Failed to fetch user data" });
    }
  }
);

// Upgrade user (Admin only)
router.put(
  "/upgrade-user/:userId",
  authMiddleware(["admin"]),
  async (req, res) => {
    try {
      const { userId } = req.params;
      const {
        role,
        requested_subjects,
        requested_class,
        requested_classes,
        ...roleData
      } = req.body;

      const updatingAdmin = req.user.user_id;

      // Only validate salary for admin and support staff roles
      if (!roleData.salary && (role === "support_staff" || role === "admin")) {
        return res.status(400).json({
          message: "Salary is required for admin and support staff upgrades",
        });
      }

      // Validate salary value if provided
      if (roleData.salary) {
        const salary = parseFloat(roleData.salary);
        if (isNaN(salary) || salary <= 0) {
          return res.status(400).json({
            message: "Invalid salary value. Salary must be a positive number.",
            field: "salary",
          });
        }
      }

      // If fee_structure_id is provided, validate it exists
      if (role === "student" && roleData.fee_structure_id) {
        const feeStructure = await prisma.feeStructure.findUnique({
          where: { id: parseInt(roleData.fee_structure_id) },
        });
        if (!feeStructure) {
          return res.status(400).json({ message: "Invalid fee structure ID" });
        }
      }

      const result = await prisma.$transaction(async (prisma) => {
        // First check if user exists and get current role data
        const existingUser = await prisma.user.findUnique({
          where: { user_id: Number(userId) },
          include: {
            student: true,
            teacher: true,
            adminSupportStaff: true,
          },
        });

        if (!existingUser) {
          throw new Error("User not found");
        }

        // Delete existing role data if any, handling dependencies first
        if (existingUser.student) {
          // Delete notifications
          await prisma.notification.deleteMany({
            where: { user_id: Number(userId) },
          });

          // Delete exam notifications
          await prisma.examNotification.deleteMany({
            where: { student_id: Number(userId) },
          });

          // Delete student requests
          await prisma.studentRequest.deleteMany({
            where: { student_id: Number(userId) },
          });

          // Delete assignment submissions
          await prisma.assignmentSubmission.deleteMany({
            where: { student_id: Number(userId) },
          });

          // Delete attendance records
          await prisma.attendance.deleteMany({
            where: { user_id: Number(userId) },
          });

          // Delete fee reminders
          await prisma.feeReminder.deleteMany({
            where: { student_id: Number(userId) },
          });

          // Delete fee payments
          await prisma.feePayment.deleteMany({
            where: { student_id: Number(userId) },
          });

          // Finally delete student record
          await prisma.student.delete({
            where: { user_id: Number(userId) },
          });
        }

        if (existingUser.teacher) {
          await prisma.teacher.delete({ where: { user_id: Number(userId) } });
        }

        if (existingUser.adminSupportStaff) {
          await prisma.adminSupportStaff.delete({
            where: { user_id: Number(userId) },
          });
        }

        // First update user's core data with requested class and subjects
        const updatedUser = await prisma.user.update({
          where: { user_id: Number(userId) },
          data: {
            role,
            plan_status: "permanent",
            demo_user_flag: false,
            // For students, store both current and requested data
            class: roleData.class_id || roleData.class || existingUser.class,
            subjects: roleData.subjects || existingUser.subjects,
            requested_class:
              requested_class || roleData.class_id || existingUser.class,
            requested_subjects:
              requested_subjects || roleData.subjects || existingUser.subjects,
          },
        });

        // Now create role-specific record
        switch (role) {
          case "admin":
          case "support_staff":
            await prisma.adminSupportStaff.create({
              data: {
                user_id: Number(userId),
                department: roleData.department,
                salary: parseFloat(roleData.salary),
                mobile: existingUser.mobile,
              },
            });
            break;

          case "teacher":
            await prisma.teacher.create({
              data: {
                user_id: Number(userId),
                subject: roleData.subject,
                class_assigned: roleData.class_assigned,
                mobile: existingUser.mobile,
              },
            });
            break;

          case "student":
            await prisma.student.create({
              data: {
                user_id: Number(userId),
                class_id: roleData.class_id,
                guardian_name: roleData.guardian_name,
                guardian_mobile: roleData.guardian_mobile || existingUser.mobile,
                mobile: existingUser.mobile,
                enrollment_date: new Date(),
                subjects: roleData.subjects,
                fee_structure_id: roleData.fee_structure_id
                  ? parseInt(roleData.fee_structure_id)
                  : null,
                address: roleData.address || "",
                date_of_birth: roleData.date_of_birth
                  ? new Date(roleData.date_of_birth)
                  : new Date(),
                fee_due_date: new Date(), // Set initial fee due date to today when upgrading to permanent
              },
            });
            break;

          default:
            throw new Error("Invalid role specified");
        }

        // Create notification for the upgraded user
        await createSystemNotification(
          prisma,
          Number(userId),
          `Your account has been upgraded from demo to permanent status by (ID: ${updatingAdmin}). Your new role is: ${role}`
        );

        // Notify admins about the upgrade
        await notifyAdmins(
          prisma,
          `User (ID: ${userId}) has been upgraded from demo to permanent status with role: ${role} by (ID: ${updatingAdmin})`
        );

        return updatedUser;
      });

      res.json({
        success: true,
        user: result,
      });
    } catch (err) {
      console.error("Upgrade error:", err);
      res.status(500).json({
        success: false,
        message: err.message || "User upgrade failed",
      });
    }
  }
);

// Get demo users (Admin only)
router.get(
  "/demo-users",
  authMiddleware(["admin", "teacher", "student", "support_staff"]),
  adminstaffCheck,
  async (req, res) => {
    try {
      const demoUsers = await prisma.user.findMany({
        where: {
          AND: [
            { plan_status: "demo" },
            { demo_user_flag: true },
            { is_active: true },
          ],
        },
        include: {
          student: true,
          teacher: true,
          adminSupportStaff: true,
        },
        orderBy: {
          created_at: "desc",
        },
      });

      const formattedUsers = demoUsers.map((user) => ({
        user_id: user.user_id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        role: user.role,
        class: user.class,
        subjects: user.subjects,
        guardian_name: user.guardian_name,
        created_at: user.created_at,
        is_active: user.is_active,
        plan_status: user.plan_status,
        role_details:
          user.student || user.teacher || user.adminSupportStaff || {},
      }));

      res.json(formattedUsers);
    } catch (err) {
      console.error("Error fetching demo users:", err);
      res.status(500).json({ message: err.message });
    }
  }
);

// Get all students
router.get(
  "/students",
  authMiddleware(["admin", "teacher", "student", "support_staff"]),
  adminstaffCheck,
  async (req, res) => {
    try {
      const students = await prisma.student.findMany({
        include: {
          user: {
            select: {
              name: true,
              email: true,
              created_at: true,
              is_active: true,
              role: true,
              plan_status: true,
            },
          },
        },
      });
      res.json(students);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

// Get all teachers
router.get(
  "/teachers",
  authMiddleware(["admin", "teacher", "student", "support_staff"]),
  adminstaffCheck,
  async (req, res) => {
    try {
      const teachers = await prisma.teacher.findMany({
        include: {
          user: {
            select: {
              name: true,
              email: true,
              created_at: true,
              is_active: true,
              role: true,
              plan_status: true,
            },
          },
        },
      });
      res.json(teachers);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

// Get all admin/support staff
router.get(
  "/admin-staff",
  authMiddleware(["admin", "teacher", "student", "support_staff"]),
  adminstaffCheck,
  async (req, res) => {
    try {
      const staff = await prisma.adminSupportStaff.findMany({
        include: {
          user: {
            select: {
              name: true,
              email: true,
              created_at: true,
              is_active: true,
              role: true,
              plan_status: true,
            },
          },
        },
      });
      res.json(staff);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

// Get all classes (no admin check required)
router.get(
  "/classes",
  authMiddleware(["admin", "teacher", "student", "support_staff"]),
  async (req, res) => {
    try {
      // First, get classes from both students and teachers
      const [teacherClasses, studentClasses] = await Promise.all([
        prisma.teacher.findMany({
          select: { class_assigned: true },
        }),
        prisma.student.findMany({
          select: { class_id: true },
        }),
      ]);

      // Process teacher classes (they might have multiple classes separated by comma)
      const teacherClassList = teacherClasses
        .map((t) => t.class_assigned.split(","))
        .flat()
        .filter(Boolean)
        .map((c) => c.trim());

      // Process student classes
      const studentClassList = studentClasses
        .map((s) => s.class_id)
        .filter(Boolean);

      // Combine both lists and remove duplicates
      const uniqueClasses = [
        ...new Set([...teacherClassList, ...studentClassList]),
      ].sort();

      res.json(uniqueClasses);
    } catch (error) {
      console.error("Error fetching classes:", error);
      res.status(500).json({ error: "Failed to fetch classes" });
    }
  }
);

// Add this new endpoint at the bottom (before module.exports)
// Get inactive users endpoint
router.get(
  "/inactive-users",
  authMiddleware(["admin", "teacher", "student", "support_staff"]),
  adminstaffCheck,
  async (req, res) => {
    try {
      const inactiveUsers = await prisma.inactiveUser.findMany({
        include: {
          user: {
            select: {
              name: true,
              email: true,
              mobile: true,
              created_at: true,
              role: true,
              plan_status: true,
            },
          },
        },
      });
      res.json(inactiveUsers);
    } catch (err) {
      console.error("Error fetching inactive users:", err);
      res.status(500).json({
        message: "Failed to fetch inactive users",
        error: err.message,
      });
    }
  }
);

// Fix in Deactivate User endpoint - Add error handling and validation
router.post(
  "/users/:userId/deactivate",
  authMiddleware(["admin", "teacher", "student", "support_staff"]),
  adminCheck,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const deactivatingAdmin = req.user.user_id;

      const result = await prisma.$transaction(async (prisma) => {
        const user = await prisma.user.findUnique({
          where: { user_id: Number(userId) },
          include: {
            student: true,
            teacher: true,
            adminSupportStaff: true,
          },
        });

        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }

        if (!user.is_active) {
          return res.status(400).json({ message: "User already inactive" });
        }

        // Validate existing role data
        const roleData = user.student || user.teacher || user.adminSupportStaff;
        if (!roleData) {
          throw new Error("No role data found for user");
        }

        await prisma.inactiveUser.create({
          data: {
            user_id: user.user_id,
            original_role: user.role,
            role_data: roleData,
            inactivation_date: new Date(),
          },
        });

        await prisma.user.update({
          where: { user_id: Number(userId) },
          data: {
            is_active: false,
            inactivation_date: new Date(),
          },
        });

        // Add conditional deletion with existence checks
        if (user.role === "student" && user.student) {
          await prisma.student.delete({ where: { user_id: Number(userId) } });
        } else if (user.role === "teacher" && user.teacher) {
          await prisma.teacher.delete({ where: { user_id: Number(userId) } });
        } else if (
          (user.role === "admin" || user.role === "support_staff") &&
          user.adminSupportStaff
        ) {
          await prisma.adminSupportStaff.delete({
            where: { user_id: Number(userId) },
          });
        }

        // Create notification for the deactivated user
        await createSystemNotification(
          prisma,
          Number(userId),
          `Your account has been deactivated by (ID: ${deactivatingAdmin}). Please contact support if you think this is a mistake.`
        );

        // Notify admins about the deactivation
        await notifyAdmins(
          prisma,
          `User (ID: ${userId}) has been deactivated by (ID: ${deactivatingAdmin})`
        );

        return { success: true };
      });

      res.json(result);
    } catch (err) {
      console.error("Deactivation error:", err);
      res.status(500).json({
        message: "User deactivation failed",
        error: err.message,
      });
    }
  }
);

// Fix in Reactivate User endpoint - Add validation
// Reactivate User (Complete Version)
router.post(
  "/inactive-users/:userId/reactivate",
  authMiddleware(["admin", "teacher", "student", "support_staff"]),
  adminstaffCheck,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const reactivatingAdmin = req.user.user_id;

      const result = await prisma.$transaction(async (prisma) => {
        // 1. Validate inactive user record
        const inactiveUser = await prisma.inactiveUser.findUnique({
          where: { user_id: Number(userId) },
        });

        if (!inactiveUser) {
          return res.status(404).json({
            message: "Inactive user record not found",
          });
        }

        // 2. Check if user already active
        const existingUser = await prisma.user.findUnique({
          where: { user_id: Number(userId) },
        });

        if (existingUser?.is_active) {
          return res.status(400).json({
            message: "User is already active",
          });
        }

        // 3. Reactivate core user
        await prisma.user.update({
          where: { user_id: Number(userId) },
          data: {
            is_active: true,
            inactivation_date: null,
            role: inactiveUser.original_role,
          },
        });

        // 4. Restore role-specific data
        const roleData = inactiveUser.role_data;

        switch (inactiveUser.original_role) {
          case "student":
            await prisma.student.create({
              data: {
                user_id: Number(userId),
                class_id: roleData.class_id || "TBD",
                guardian_name: roleData.guardian_name,
                guardian_mobile: roleData.guardian_mobile,
                address: roleData.address || "",
                date_of_birth: roleData.date_of_birth
                  ? new Date(roleData.date_of_birth)
                  : new Date(),
                mobile: roleData.mobile || existingUser.mobile,
              },
            });
            break;

          case "teacher":
            await prisma.teacher.create({
              data: {
                user_id: Number(userId),
                subject: roleData.subject,
                class_assigned: roleData.class_assigned,
                mobile: roleData.mobile || existingUser.mobile,
              },
            });
            break;

          case "admin":
          case "support_staff":
            await prisma.adminSupportStaff.create({
              data: {
                user_id: Number(userId),
                department: roleData.department,
                salary: roleData.salary ? parseFloat(roleData.salary) : 0,
                mobile: roleData.mobile || existingUser.mobile,
              },
            });
            break;

          default:
            throw new Error("Invalid original role for reactivation");
        }

        // 5. Cleanup inactive record
        await prisma.inactiveUser.delete({
          where: { user_id: Number(userId) },
        });

        // Create notification for the reactivated user
        await createSystemNotification(
          prisma,
          Number(userId),
          `Your account has been reactivated by (ID: ${reactivatingAdmin}). Welcome back!`
        );

        // Notify admins about the reactivation
        await notifyAdmins(
          prisma,
          `User (ID: ${userId}) has been reactivated by (ID: ${reactivatingAdmin})`
        );

        return {
          success: true,
          message: "User reactivated successfully",
        };
      });

      res.json(result);
    } catch (err) {
      console.error("Reactivation error:", err);
      res.status(500).json({
        message: "User reactivation failed",
        error: err.message,
        details: {
          userId: req.params.userId,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }
);

// Fix in Edit User endpoint - Add validation and error handling
router.put(
  "/users/:userId",
  authMiddleware(["admin", "teacher", "student", "support_staff"]),
  async (req, res) => {
    try {
      const { userId } = req.params;
      const updateData = req.body;
      const updatingAdmin = req.user.user_id;

      const result = await prisma.$transaction(async (prisma) => {
        const targetUser = await prisma.user.findUnique({
          where: { user_id: Number(userId) },
          include: {
            student: true,
            teacher: true,
            adminSupportStaff: true,
          },
        });

        if (!targetUser) {
          throw new Error("User not found");
        }

        // Check permissions
        if (req.user.role !== "admin") {
          if (Number(userId) !== req.user.user_id) {
            throw new Error("Permission denied");
          }
          if (updateData.plan_status || updateData.role) {
            throw new Error("Only administrators can modify plan status or role");
          }
        }

        // Create a list of changed fields
        const changedFields = Object.keys(updateData).filter(
          (key) => targetUser[key] !== updateData[key]
        );

        // Update core user data
        const user = await prisma.user.update({
          where: { user_id: Number(userId) },
          data: updateData,
        });

        // Sync mobile number with role-specific tables if it was updated
        if (updateData.mobile) {
          if (targetUser.student) {
            await prisma.student.update({
              where: { user_id: Number(userId) },
              data: { mobile: updateData.mobile },
            });
          } else if (targetUser.teacher) {
            await prisma.teacher.update({
              where: { user_id: Number(userId) },
              data: { mobile: updateData.mobile },
            });
          } else if (targetUser.adminSupportStaff) {
            await prisma.adminSupportStaff.update({
              where: { user_id: Number(userId) },
              data: { mobile: updateData.mobile },
            });
          }
        }

        if (changedFields.length > 0) {
          // Create notification for the edited user
          await prisma.notification.create({
            data: {
              user_id: Number(userId),
              message: `Your profile has been updated by (ID: ${updatingAdmin}). Changed fields: ${changedFields.join(
                ", "
              )}`,
              type: "system",
            },
          });

          // Notify admins if the edit wasn't made by the user themselves
          if (Number(userId) !== updatingAdmin) {
            const adminUsers = await prisma.user.findMany({
              where: {
                role: "admin",
                is_active: true,
              },
              select: { user_id: true },
            });

            await prisma.notification.createMany({
              data: adminUsers.map((admin) => ({
                user_id: admin.user_id,
                message: `User (ID: ${userId}) profile has been updated by (ID: ${updatingAdmin}). Changed fields: ${changedFields.join(
                  ", "
                )}`,
                type: "system",
              })),
            });
          }
        }

        return user;
      });

      res.json(result);
    } catch (err) {
      console.error("User update error:", err);
      res.status(500).json({
        message: "Failed to update user",
        error: err.message,
      });
    }
  }
);

// Update student
router.put(
  "/students/:userId",
  authMiddleware(["admin", "teacher", "student", "support_staff"]),
  adminstaffCheck,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const updateData = req.body;
      const updatingAdmin = req.user.user_id;

      // Validate fee structure if provided
      if (updateData.fee_structure_id) {
        const feeStructure = await prisma.feeStructure.findUnique({
          where: { id: parseInt(updateData.fee_structure_id) },
        });
        if (!feeStructure) {
          return res.status(400).json({ message: "Invalid fee structure ID" });
        }
      }

      const result = await prisma.$transaction(async (prisma) => {
        // Get previous student data for comparison
        const previousData = await prisma.student.findUnique({
          where: { user_id: Number(userId) },
        });

        if (!previousData) {
          throw new Error("Student not found");
        }

        // Update student record
        const student = await prisma.student.update({
          where: { user_id: Number(userId) },
          data: {
            ...updateData,
            fee_structure_id: updateData.fee_structure_id
              ? parseInt(updateData.fee_structure_id)
              : undefined,
          },
        });

        // Sync relevant fields with User table
        await prisma.user.update({
          where: { user_id: Number(userId) },
          data: {
            class: updateData.class_id,
            subjects: updateData.subjects,
          },
        });

        // Create a list of changed fields
        const changedFields = Object.keys(updateData).filter(
          (key) => previousData[key] !== updateData[key]
        );

        if (changedFields.length > 0) {
          // Create notification for the student
          await createSystemNotification(
            prisma,
            Number(userId),
            `Your student profile has been updated by (ID: ${updatingAdmin}). Changed fields: ${changedFields.join(
              ", "
            )}`
          );

          // Notify admins
          await notifyAdmins(
            prisma,
            `Student (ID: ${userId}) profile has been updated by (ID: ${updatingAdmin}). Changed fields: ${changedFields.join(
              ", "
            )}`
          );
        }

        return student;
      });

      res.json(result);
    } catch (err) {
      console.error("Student update error:", err);
      res.status(500).json({
        message: "Failed to update student",
        error: err.message,
      });
    }
  }
);

// Update teacher
router.put(
  "/teachers/:userId",
  authMiddleware(["admin", "teacher", "student", "support_staff"]),
  adminstaffCheck,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const updateData = req.body;
      const updatingAdmin = req.user.user_id;

      // Validate required fields
      if (!updateData.subject || !updateData.class_assigned) {
        return res.status(400).json({
          message: "Subject and class assignment are required",
          error: "Missing required fields",
        });
      }

      const result = await prisma.$transaction(async (prisma) => {
        // Get previous teacher data
        const previousData = await prisma.teacher.findUnique({
          where: { user_id: Number(userId) },
        });

        if (!previousData) {
          throw new Error("Teacher not found");
        }

        // Update teacher record
        const teacher = await prisma.teacher.update({
          where: { user_id: Number(userId) },
          data: {
            subject: updateData.subject,
            class_assigned: updateData.class_assigned,
            mobile: updateData.mobile || previousData.mobile,
          },
        });

        // Sync with User model
        await prisma.user.update({
          where: { user_id: Number(userId) },
          data: {
            class: updateData.class_assigned,
            subjects: updateData.subject,
          },
        });

        // Create a list of changed fields for notifications
        const changedFields = Object.keys(updateData).filter(
          (key) => previousData[key] !== updateData[key]
        );

        if (changedFields.length > 0) {
          // Create notification for the teacher
          await createSystemNotification(
            prisma,
            Number(userId),
            `Your teacher profile has been updated by (ID: ${updatingAdmin}). Changed fields: ${changedFields.join(
              ", "
            )}`
          );

          // Notify admins
          await notifyAdmins(
            prisma,
            `Teacher (ID: ${userId}) profile has been updated by (ID: ${updatingAdmin}). Changed fields: ${changedFields.join(
              ", "
            )}`
          );
        }

        return teacher;
      });

      res.json(result);
    } catch (err) {
      console.error("Teacher update error:", err);
      res.status(500).json({
        message: "Failed to update teacher",
        error: err.message,
      });
    }
  }
);

// Update admin-staff
router.put(
  "/admin-staff/:userId",
  authMiddleware(["admin", "teacher", "student", "support_staff"]),
  adminstaffCheck,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const updateData = req.body;
      const updatingAdmin = req.user.user_id;

      const result = await prisma.$transaction(async (prisma) => {
        // Get previous data
        const previousData = await prisma.adminSupportStaff.findUnique({
          where: { user_id: Number(userId) },
        });

        if (!previousData) {
          throw new Error("Admin/Support staff not found");
        }

        // Update admin/support staff record
        const adminStaff = await prisma.adminSupportStaff.update({
          where: { user_id: Number(userId) },
          data: updateData,
        });

        // Create a list of changed fields
        const changedFields = Object.keys(updateData).filter(
          (key) => previousData[key] !== updateData[key]
        );

        if (changedFields.length > 0) {
          // Create notification for the admin/support staff
          await createSystemNotification(
            prisma,
            Number(userId),
            `Your profile has been updated by (ID: ${updatingAdmin}). Changed fields: ${changedFields.join(
              ", "
            )}`
          );

          // Notify admins
          await notifyAdmins(
            prisma,
            `Admin/Support Staff (ID: ${userId}) profile has been updated by (ID: ${updatingAdmin}). Changed fields: ${changedFields.join(
              ", "
            )}`
          );
        }

        return adminStaff;
      });

      res.json(result);
    } catch (err) {
      console.error("Admin staff update error:", err);
      res.status(500).json({
        message: "Failed to update admin staff",
        error: err.message,
      });
    }
  }
);

// Get students by class
router.get(
  "/students-by-class",
  authMiddleware(["admin", "teacher", "student", "support_staff"]),
  async (req, res) => {
    try {
      const { class: classId } = req.query;

      if (!classId) {
        return res.status(400).json({ error: "Class ID is required" });
      }

      const students = await prisma.user.findMany({
        where: {
          role: "student",
          is_active: true,
          student: {
            class_id: classId,
          },
        },
        select: {
          user_id: true,
          name: true,
          email: true,
          student: {
            select: {
              class_id: true,
              subjects: true,
            },
          },
        },
      });

      const formattedStudents = students.map((student) => ({
        user_id: student.user_id,
        name: student.name,
        email: student.email,
        class_id: student.student?.class_id,
        subjects: student.student?.subjects,
      }));

      res.json(formattedStudents);
    } catch (error) {
      console.error("Error fetching students by class:", error);
      res.status(500).json({ error: "Failed to fetch students" });
    }
  }
);

// Get teacher by class ID with complete subject information
router.get(
  "/teacher-by-class/:classId",
  authMiddleware(["admin", "teacher", "student", "support_staff"]),
  async (req, res) => {
    try {
      const { classId } = req.params;

      // If the class ID doesn't contain a hyphen, search for all teachers assigned to this class
      if (!classId.includes("-")) {
        const teachers = await prisma.user.findMany({
          where: {
            AND: [
              { role: "teacher" },
              { is_active: true },
              {
                teacher: {
                  OR: [
                    { class_assigned: classId }, // Exact match
                    { class_assigned: { contains: `,${classId}` } }, // Match as part of comma-separated list
                    { class_assigned: { contains: `${classId},` } }, // Match at start of list
                  ],
                },
              },
            ],
          },
          include: {
            teacher: {
              select: {
                subject: true,
                class_assigned: true,
              },
            },
          },
        });

        if (!teachers || teachers.length === 0) {
          return res
            .status(404)
            .json({ error: "No teachers found for this class" });
        }

        const formattedTeachers = teachers.map((teacher) => ({
          user_id: teacher.user_id,
          name: teacher.name,
          email: teacher.email,
          subjects: teacher.subjects || teacher.teacher?.subject,
          class_assigned: teacher.teacher?.class_assigned,
        }));

        return res.json(formattedTeachers);
      }

      // Original logic for teacherId-className format
      const teacherId = parseInt(classId.split("-")[0]);

      if (isNaN(teacherId)) {
        return res.status(400).json({ error: "Invalid class ID format" });
      }

      const teacher = await prisma.user.findFirst({
        where: {
          AND: [
            { user_id: teacherId },
            { role: "teacher" },
            { is_active: true },
          ],
        },
        include: {
          teacher: {
            select: {
              subject: true,
              class_assigned: true,
            },
          },
        },
      });

      if (!teacher) {
        return res.status(404).json({ error: "Teacher not found" });
      }

      // Verify if this teacher is actually assigned to the requested class
      const assignedClasses = teacher.teacher?.class_assigned
        .split(",")
        .map((c) => c.trim());
      if (!assignedClasses?.includes(classId)) {
        return res.status(404).json({
          error: "Teacher not assigned to this class",
          teacherId: teacher.user_id,
          assignedClasses,
        });
      }

      const formattedTeacher = {
        user_id: teacher.user_id,
        name: teacher.name,
        email: teacher.email,
        subjects: teacher.subjects || teacher.teacher?.subject,
        class_assigned: teacher.teacher?.class_assigned,
      };

      res.json([formattedTeacher]); // Return as array for consistency
    } catch (error) {
      console.error("Error fetching teacher:", error);
      res.status(500).json({ error: "Failed to fetch teacher information" });
    }
  }
);

// Inside upgrade user route
router.post(
  "/upgrade/:userId",
  authMiddleware(["admin", "support_staff"]),
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { role, roleData } = req.body;

      const existingUser = await prisma.user.findUnique({
        where: { user_id: Number(userId) },
        include: {
          adminSupportStaff: true,
          teacher: true,
          student: true,
        },
      });

      if (!existingUser) {
        return res.status(404).json({ error: "User not found" });
      }

      const result = await prisma.$transaction(async (prisma) => {
        // Delete existing role data
        if (existingUser.teacher) {
          await prisma.teacher.delete({
            where: { user_id: Number(userId) },
          });
        }
        // ...existing role data deletion...

        // Update user's core data
        const updatedUser = await prisma.user.update({
          where: { user_id: Number(userId) },
          data: {
            role,
            plan_status: "permanent",
            demo_user_flag: false,
            // Sync relevant fields based on role
            ...(role === "teacher" && {
              class: roleData.class_assigned,
              subjects: roleData.subject,
            }),
            ...(role === "student" && {
              class: roleData.class_id,
              subjects: roleData.subjects,
            }),
          },
        });

        // Create role-specific record
        switch (role) {
          case "teacher":
            if (!roleData.subject || !roleData.class_assigned) {
              throw new Error(
                "Subject and class assignment are required for teachers"
              );
            }
            await prisma.teacher.create({
              data: {
                user_id: Number(userId),
                subject: roleData.subject,
                class_assigned: roleData.class_assigned,
                mobile: existingUser.mobile,
              },
            });
            break;
          case "student":
            await prisma.student.create({
              data: {
                user_id: Number(userId),
                class_id: roleData.class_id,
                guardian_name: roleData.guardian_name,
                guardian_mobile:
                  roleData.guardian_mobile || existingUser.mobile,
                mobile: existingUser.mobile,
                enrollment_date: new Date(),
                subjects: roleData.subjects,
                fee_structure_id: roleData.fee_structure_id
                  ? parseInt(roleData.fee_structure_id)
                  : null,
                address: roleData.address || "",
                date_of_birth: roleData.date_of_birth
                  ? new Date(roleData.date_of_birth)
                  : new Date(),
              },
            });
            break;
          // ...rest of existing role cases...
        }

        // Create notification for the upgraded user
        await prisma.notification.create({
          data: {
            user_id: Number(userId),
            message: `Your account has been upgraded to ${role}`,
            type: "role_upgrade",
          },
        });

        return updatedUser;
      });

      res.json(result);
    } catch (error) {
      console.error("Error upgrading user:", error);
      res.status(500).json({
        error: "Failed to upgrade user",
        details: error.message,
      });
    }
  }
);

// Get teacher details
router.get(
  "/teachers/:id",
  authMiddleware(["admin", "teacher", "student", "support_staff"]),
  async (req, res) => {
    try {
      const { id } = req.params;

      const teacher = await prisma.user.findFirst({
        where: {
          user_id: parseInt(id),
          role: "teacher",
          is_active: true,
        },
        include: {
          teacher: {
            select: {
              subject: true,
              class_assigned: true,
            },
          },
        },
      });

      if (!teacher) {
        return res.status(404).json({ error: "Teacher not found" });
      }

      const formattedTeacher = {
        user_id: teacher.user_id,
        name: teacher.name,
        subject: teacher.teacher?.subject || "",
        class_assigned: teacher.teacher?.class_assigned || "",
      };

      res.json(formattedTeacher);
    } catch (error) {
      console.error("Error fetching teacher details:", error);
      res.status(500).json({ error: "Failed to fetch teacher details" });
    }
  }
);

// Add teacher data endpoint
router.get(
  "/users/teacher-data",
  authMiddleware(["teacher"]),
  async (req, res) => {
    try {
      const teacher = await prisma.user.findUnique({
        where: {
          user_id: req.user.user_id,
          role: "teacher",
        },
        include: {
          teacher: {
            select: {
              subject: true,
              class_assigned: true,
            },
          },
        },
      });

      if (!teacher) {
        return res.status(404).json({ error: "Teacher not found" });
      }

      // Parse classes and subjects
      const classes = teacher.teacher.class_assigned
        ? teacher.teacher.class_assigned.split(",").map((c) => c.trim())
        : [];
      const subjects = teacher.teacher.subject
        ? teacher.teacher.subject.split(",").map((s) => s.trim())
        : [];

      res.json({
        classes,
        subjects,
      });
    } catch (error) {
      console.error("Error fetching teacher data:", error);
      res.status(500).json({ error: "Failed to fetch teacher data" });
    }
  }
);

// Get teacher data
router.get("/teacher-data", authMiddleware(["teacher"]), async (req, res) => {
  try {
    const teacher = await prisma.user.findUnique({
      where: {
        user_id: req.user.user_id,
        role: "teacher",
      },
      include: {
        teacher: {
          select: {
            subject: true,
            class_assigned: true,
          },
        },
      },
    });

    if (!teacher) {
      return res.status(404).json({ error: "Teacher not found" });
    }

    // Parse classes and subjects
    const classes = teacher.teacher?.class_assigned
      ? teacher.teacher.class_assigned.split(",").map((c) => c.trim())
      : [];
    const subjects = teacher.teacher?.subject
      ? teacher.teacher.subject.split(",").map((s) => s.trim())
      : [];

    res.json({
      classes,
      subjects,
    });
  } catch (error) {
    console.error("Error fetching teacher data:", error);
    res.status(500).json({ error: "Failed to fetch teacher data" });
  }
});

// Get students by IDs
router.get(
  "/students-by-ids",
  authMiddleware(["admin", "teacher", "support_staff"]),
  async (req, res) => {
    try {
      const studentIds = req.query.studentIds
        ?.toString()
        .split(",")
        .map(Number);

      if (!studentIds || studentIds.length === 0) {
        return res.status(400).json({ error: "No student IDs provided" });
      }

      const students = await prisma.user.findMany({
        where: {
          user_id: {
            in: studentIds,
          },
          role: "student",
        },
        select: {
          user_id: true,
          name: true,
          email: true,
          mobile: true,
          class: true,
          subjects: true,
        },
      });

      res.json(students);
    } catch (error) {
      console.error("Error fetching students by IDs:", error);
      res.status(500).json({ error: "Failed to fetch students" });
    }
  }
);

module.exports = router;
