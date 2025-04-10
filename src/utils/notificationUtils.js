const { prisma } = require("../config/prisma");

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
        type: "system",
      })),
    });
  }
};

const createNotification = async (userId, message, type) => {
  try {
    await prisma.notification.create({
      data: {
        user_id: userId,
        message,
        type,
        is_read: false,
      },
    });
  } catch (error) {
    console.error("Error creating notification:", error);
  }
};

const notifyAdminAndSupportStaff = async (message, type) => {
  try {
    const staffUsers = await prisma.user.findMany({
      where: {
        OR: [{ role: "admin" }, { role: "support_staff" }],
        is_active: true,
      },
    });

    const notifications = staffUsers.map((user) => ({
      user_id: user.user_id,
      message,
      type,
      is_read: false,
    }));

    if (notifications.length > 0) {
      await prisma.notification.createMany({
        data: notifications,
      });
    }
  } catch (error) {
    console.error("Error notifying admin and support staff:", error);
  }
};

const createAssignmentNotifications = async (
  studentIds,
  assignmentTitle,
  dueDate,
  type = "assignment",
  teacherName = ""
) => {
  try {
    const students = studentIds.map((id) => parseInt(id));
    const formattedDate = new Date(dueDate).toLocaleDateString();

    // Create notifications for students
    const studentNotifications = students.map((studentId) => ({
      user_id: studentId,
      message:
        type === "assignment"
          ? `New assignment: ${assignmentTitle} - Due on ${formattedDate}`
          : `Assignment ${assignmentTitle} is due tomorrow!`,
      type,
      is_read: false,
    }));

    await prisma.notification.createMany({
      data: studentNotifications,
    });

    // Find all admin and support staff users
    const adminStaff = await prisma.user.findMany({
      where: {
        OR: [{ role: "admin" }, { role: "support_staff" }],
        is_active: true,
      },
    });

    // Log the found admin/staff users for debugging
    console.log("Found admin/staff users:", adminStaff);

    if (adminStaff.length > 0) {
      // Create notifications for admin and support staff
      const adminStaffNotifications = adminStaff.map((staff) => ({
        user_id: staff.user_id,
        message: `New assignment "${assignmentTitle}" created by ${teacherName} for ${students.length} students. Due on ${formattedDate}`,
        type: "assignment_created",
        is_read: false,
      }));

      // Log the notifications being created
      console.log("Creating admin notifications:", adminStaffNotifications);

      await prisma.notification.createMany({
        data: adminStaffNotifications,
      });
    } else {
      console.log("No admin/staff users found to notify");
    }
  } catch (error) {
    console.error("Error creating assignment notifications:", error);
    console.error("Error details:", error.stack);
  }
};

const createSubmissionNotification = async (
  teacherId,
  studentId,
  studentName,
  assignmentTitle,
  submissionStatus
) => {
  try {
    // Notify teacher
    await createNotification(
      teacherId,
      `${studentName} has submitted their work for assignment: ${assignmentTitle} (${submissionStatus})`,
      "assignment_submission"
    );

    // Notify student of successful submission
    await createNotification(
      studentId,
      `Your work for assignment "${assignmentTitle}" has been ${
        submissionStatus === "late"
          ? "submitted late"
          : "submitted successfully"
      }`,
      "submission_confirmation"
    );
  } catch (error) {
    console.error("Error creating submission notification:", error);
  }
};

const createSalaryNotification = async (teacherId, message, type) => {
  try {
    // Create notification for teacher
    await createNotification(teacherId, message, type);

    // Create notification for admin and support staff
    const teacher = await prisma.user.findUnique({
      where: { user_id: teacherId },
      select: { name: true },
    });

    const adminMessage = `Salary ${
      type === "salary_update" ? "configuration updated" : "payment processed"
    } for teacher ${teacher?.name || `ID: ${teacherId}`}`;

    await notifyAdminAndSupportStaff(adminMessage, type);
  } catch (error) {
    console.error("Error creating salary notification:", error);
  }
};

const createTestNotification = async (
  testId,
  studentIds,
  teacherId,
  testTitle,
  dueDate,
  type = "test_created"
) => {
  try {
    const formattedDate = new Date(dueDate).toLocaleDateString();

    // Create notifications for students
    const studentNotifications = studentIds.map((id) => ({
      user_id: parseInt(id),
      message:
        type === "test_created"
          ? `New test: ${testTitle} - Scheduled for ${formattedDate}`
          : `Test ${testTitle} is scheduled for tomorrow!`,
      type,
      is_read: false,
    }));

    await prisma.notification.createMany({
      data: studentNotifications,
    });

    // Create notification for teacher
    if (teacherId) {
      await createNotification(
        teacherId,
        `Test "${testTitle}" has been created and scheduled for ${formattedDate}`,
        type
      );
    }

    // Notify admin and support staff
    await notifyAdminAndSupportStaff(
      `New test "${testTitle}" created and scheduled for ${formattedDate}`,
      type
    );
  } catch (error) {
    console.error("Error creating test notifications:", error);
  }
};

const createTestSubmissionNotification = async (
  studentId,
  teacherId,
  testTitle,
  isLate = false
) => {
  try {
    // Notify teacher
    await createNotification(
      teacherId,
      `Test submission received${isLate ? " (late)" : ""} for: ${testTitle}`,
      "test_submission"
    );

    // Notify student
    await createNotification(
      studentId,
      `Your test "${testTitle}" has been ${
        isLate ? "submitted late" : "submitted successfully"
      }`,
      "test_submission"
    );
  } catch (error) {
    console.error("Error creating test submission notification:", error);
  }
};

const createTestGradedNotification = async (studentId, testTitle, grade) => {
  try {
    await createNotification(
      studentId,
      `Your test "${testTitle}" has been graded. Grade: ${grade}`,
      "test_graded"
    );
  } catch (error) {
    console.error("Error creating test graded notification:", error);
  }
};

const createExpenseNotification = async (
  userId,
  amount,
  type,
  creatorId = null,
  remarks = null
) => {
  try {
    const formatAmount = (amount) => `₹${amount.toLocaleString("en-IN")}`;
    const formattedAmount = formatAmount(amount);

    const messages = {
      expense_created: `Your expense request for ${formattedAmount} has been submitted and is pending approval`,
      expense_pending: `New expense request for ${formattedAmount} requires your approval`,
      expense_approved: `Your expense request for ${formattedAmount} has been approved`,
      expense_rejected: `Your expense request for ${formattedAmount} has been rejected${
        remarks ? `: ${remarks}` : ""
      }`,
    };

    if (type === "expense_pending") {
      // For pending expenses, notify all admins and support staff
      await notifyAdminAndSupportStaff(
        `New expense request for ${formattedAmount} submitted by ${
          creatorId ? `User ID: ${creatorId}` : "a user"
        } requires approval`,
        type
      );
    } else {
      // For other types, notify the specific user
      await createNotification(userId, messages[type], type);
    }
  } catch (error) {
    console.error("Error creating expense notification:", error);
  }
};

module.exports = {
  createNotification,
  createAssignmentNotifications,
  createSubmissionNotification,
  createSalaryNotification,
  notifyAdminAndSupportStaff,
  createTestNotification,
  createTestSubmissionNotification,
  createTestGradedNotification,
  createExpenseNotification,
  createSystemNotification,
  notifyAdmins,
};
