const express = require("express");
const router = express.Router();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { authMiddleware } = require("../middleware/authMiddleware");

// Check role middleware
const checkRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "Access denied" });
    }
    next();
  };
};

// Create notification for a group of users
const createGroupNotification = async (prisma, userIds, message, type) => {
  if (userIds.length > 0) {
    await prisma.notification.createMany({
      data: userIds.map((userId) => ({
        user_id: userId,
        message,
        type,
      })),
    });
  }
};

// Get admin user IDs
const getAdminUserIds = async (prisma) => {
  const admins = await prisma.user.findMany({
    where: {
      role: "admin",
      is_active: true,
    },
    select: {
      user_id: true,
    },
  });
  return admins.map((admin) => admin.user_id);
};

// Get teachers by class and subject
router.get(
  "/teachers",
  authMiddleware(["admin", "teacher", "student", "support_staff"]),
  async (req, res) => {
    const { class_id, subject } = req.query;

    try {
      const teachers = await prisma.user.findMany({
        where: {
          role: "teacher",
          teacher: {
            AND: [
              {
                subject: {
                  contains: subject,
                },
              },
              {
                class_assigned: {
                  contains: class_id,
                },
              },
            ],
          },
        },
        select: {
          user_id: true,
          name: true,
          teacher: {
            select: {
              subject: true,
              class_assigned: true,
            },
          },
        },
      });

      const formattedTeachers = teachers.map((teacher) => ({
        user_id: teacher.user_id,
        name: teacher.name,
        subject: teacher.teacher.subject,
        class_assigned: teacher.teacher.class_assigned,
      }));

      res.json(formattedTeachers);
    } catch (error) {
      console.error("Error fetching teachers:", error);
      res.status(500).json({ error: "Failed to fetch teachers" });
    }
  }
);

// Schedule extra class
router.post(
  "/",
  authMiddleware(["admin", "teacher", "support_staff"]),
  checkRole("teacher", "admin", "support_staff"),
  async (req, res) => {
    const {
      class_id,
      subject,
      date,
      start_time,
      end_time,
      description,
      teacher_id,
    } = req.body;
    const created_by = req.user.user_id;

    try {
      // If user is a teacher, they can only create classes for themselves
      if (
        req.user.role === "teacher" &&
        teacher_id &&
        teacher_id !== req.user.user_id
      ) {
        return res
          .status(403)
          .json({ error: "Teachers can only schedule their own classes" });
      }

      // For teachers, use their own ID; for support staff/admin, use the selected teacher_id
      const finalTeacherId =
        req.user.role === "teacher" ? req.user.user_id : teacher_id;

      // Validate if the selected teacher is assigned to this class and subject
      if (req.user.role !== "teacher") {
        const teacher = await prisma.teacher.findUnique({
          where: { user_id: finalTeacherId },
        });

        if (
          !teacher ||
          !teacher.class_assigned.includes(class_id) ||
          !teacher.subject.includes(subject)
        ) {
          return res.status(403).json({
            error: "Selected teacher is not authorized for this class/subject",
          });
        }
      }

      const extraClass = await prisma.$transaction(async (prisma) => {
        // Create the extra class
        const newClass = await prisma.extraClass.create({
          data: {
            class_id,
            subject,
            teacher_id: finalTeacherId,
            created_by,
            date: new Date(date),
            start_time,
            end_time,
            description,
          },
          include: {
            teacher: {
              select: {
                name: true,
              },
            },
            creator: {
              select: {
                name: true,
              },
            },
          },
        });

        // Get all students in the class
        const students = await prisma.student.findMany({
          where: { class_id },
          select: { user_id: true },
        });

        // Get all admin users
        const adminUserIds = await getAdminUserIds(prisma);

        // Create notification for students
        await createGroupNotification(
          prisma,
          students.map((s) => s.user_id),
          `New extra class scheduled for ${subject} on ${date} from ${start_time} to ${end_time}`,
          "extra_class"
        );

        // Create notification for admins
        await createGroupNotification(
          prisma,
          adminUserIds,
          `New extra class scheduled for ${class_id} - ${subject} on ${date} from ${start_time} to ${end_time} by ${newClass.teacher.name}`,
          "extra_class"
        );

        // Create notification for the teacher if not self-assigned
        if (finalTeacherId !== created_by) {
          await prisma.notification.create({
            data: {
              user_id: finalTeacherId,
              message: `You have been assigned to teach an extra class for ${subject} on ${date} from ${start_time} to ${end_time}`,
              type: "extra_class",
            },
          });
        }

        return newClass;
      });

      res.json(extraClass);
    } catch (error) {
      console.error("Error scheduling extra class:", error);
      res.status(500).json({ error: "Failed to schedule extra class" });
    }
  }
);

// Get all extra classes (when no specific class is selected)
router.get(
  "/",
  authMiddleware(["admin", "teacher", "student", "support_staff"]),
  async (req, res) => {
    try {
      const extraClasses = await prisma.extraClass.findMany({
        include: {
          teacher: {
            select: {
              name: true,
            },
          },
          creator: {
            select: {
              name: true,
              role: true,
            },
          },
        },
        orderBy: [{ date: "asc" }, { start_time: "asc" }],
      });

      const formattedClasses = extraClasses.map((ec) => ({
        ...ec,
        date: ec.date.toISOString().split("T")[0],
      }));

      res.json(formattedClasses);
    } catch (error) {
      console.error("Error fetching all extra classes:", error);
      res.status(500).json({ error: "Failed to fetch extra classes" });
    }
  }
);

// Get extra classes for a class
router.get(
  "/class/:classId",
  authMiddleware(["admin", "teacher", "student", "support_staff"]),
  async (req, res) => {
    const { classId } = req.params;
    const { startDate, endDate } = req.query;

    try {
      const extraClasses = await prisma.extraClass.findMany({
        where: {
          class_id: classId,
          date: {
            gte: startDate ? new Date(startDate) : undefined,
            lte: endDate ? new Date(endDate) : undefined,
          },
        },
        include: {
          teacher: {
            select: {
              name: true,
            },
          },
          creator: {
            select: {
              name: true,
              role: true,
            },
          },
        },
        orderBy: {
          date: "asc",
        },
      });

      // Convert dates to ISO strings for consistent handling in frontend
      const formattedClasses = extraClasses.map((ec) => ({
        ...ec,
        date: ec.date.toISOString().split("T")[0],
      }));

      res.json(formattedClasses);
    } catch (error) {
      console.error("Error fetching extra classes:", error);
      res.status(500).json({ error: "Failed to fetch extra classes" });
    }
  }
);

// Get a single extra class by ID
router.get(
  "/:id",
  authMiddleware(["admin", "teacher", "student", "support_staff"]),
  async (req, res) => {
    const { id } = req.params;

    try {
      const extraClass = await prisma.extraClass.findUnique({
        where: {
          id: parseInt(id),
        },
        include: {
          teacher: {
            select: {
              name: true,
            },
          },
          creator: {
            select: {
              name: true,
              role: true,
            },
          },
        },
      });

      if (!extraClass) {
        return res.status(404).json({ error: "Extra class not found" });
      }

      res.json({
        ...extraClass,
        date: extraClass.date.toISOString().split("T")[0],
      });
    } catch (error) {
      console.error("Error fetching extra class:", error);
      res.status(500).json({ error: "Failed to fetch extra class details" });
    }
  }
);

// Delete an extra class
router.delete(
  "/:id",
  authMiddleware(["admin", "teacher", "support_staff"]),
  checkRole("teacher", "admin", "support_staff"),
  async (req, res) => {
    const { id } = req.params;

    try {
      const numericId = parseInt(id);
      if (isNaN(numericId)) {
        return res.status(400).json({ error: "Invalid ID format" });
      }

      const extraClass = await prisma.extraClass.findUnique({
        where: { id: numericId },
        select: { teacher_id: true },
      });

      if (!extraClass) {
        return res.status(404).json({ error: "Extra class not found" });
      }

      // Teachers can only delete their own classes
      if (
        req.user.role === "teacher" &&
        extraClass.teacher_id !== req.user.user_id
      ) {
        return res
          .status(403)
          .json({ error: "You can only delete your own extra classes" });
      }

      // Delete using transaction to ensure data consistency
      await prisma.$transaction(async (prisma) => {
        // Get class details before deletion for notification
        const classDetails = await prisma.extraClass.findUnique({
          where: { id: numericId },
          select: {
            class_id: true,
            subject: true,
            date: true,
            start_time: true,
            end_time: true,
            teacher_id: true,
            teacher: {
              select: {
                name: true,
              },
            },
          },
        });

        // Get all students in the class
        const students = await prisma.student.findMany({
          where: { class_id: classDetails.class_id },
          select: { user_id: true },
        });

        // Get all admin users
        const adminUserIds = await getAdminUserIds(prisma);

        // Create cancellation notifications for students
        await createGroupNotification(
          prisma,
          students.map((s) => s.user_id),
          `Extra class for ${classDetails.subject} on ${
            classDetails.date.toISOString().split("T")[0]
          } has been cancelled`,
          "extra_class"
        );

        // Create cancellation notifications for admins
        await createGroupNotification(
          prisma,
          adminUserIds,
          `Extra class for ${classDetails.class_id} - ${
            classDetails.subject
          } on ${classDetails.date.toISOString().split("T")[0]} by ${
            classDetails.teacher.name
          } has been cancelled`,
          "extra_class"
        );

        // Notify teacher if they didn't delete it themselves
        if (classDetails.teacher_id !== req.user.user_id) {
          await prisma.notification.create({
            data: {
              user_id: classDetails.teacher_id,
              message: `Your extra class for ${classDetails.subject} on ${
                classDetails.date.toISOString().split("T")[0]
              } has been cancelled`,
              type: "extra_class",
            },
          });
        }

        // First update all attendance records to remove the extra_class_id reference
        await prisma.attendance.updateMany({
          where: { extra_class_id: numericId },
          data: { extra_class_id: null },
        });

        // Then delete the extra class
        await prisma.extraClass.delete({
          where: { id: numericId },
        });
      });

      res.json({ success: true, message: "Extra class deleted successfully" });
    } catch (error) {
      console.error("Error deleting extra class:", error);
      res
        .status(500)
        .json({ error: "Failed to delete extra class. Please try again." });
    }
  }
);

// Update an extra class
router.put(
  "/:id",
  authMiddleware(["admin", "teacher", "support_staff"]),
  checkRole("teacher", "admin", "support_staff"),
  async (req, res) => {
    const { id } = req.params;
    const { date, start_time, end_time, description, teacher_id } = req.body;

    try {
      const extraClass = await prisma.extraClass.findUnique({
        where: { id: parseInt(id) },
        select: { teacher_id: true },
      });

      if (!extraClass) {
        return res.status(404).json({ error: "Extra class not found" });
      }

      // Only restrict teachers to their own classes, admin and support staff can edit any class
      if (
        req.user.role === "teacher" &&
        extraClass.teacher_id !== req.user.user_id
      ) {
        return res
          .status(403)
          .json({ error: "You can only update your own extra classes" });
      }

      // Validate new teacher if teacher_id is provided
      if (teacher_id) {
        const newTeacher = await prisma.teacher.findUnique({
          where: { user_id: teacher_id },
        });

        if (!newTeacher) {
          return res.status(404).json({ error: "New teacher not found" });
        }
      }

      const updatedExtraClass = await prisma.$transaction(async (prisma) => {
        const updated = await prisma.extraClass.update({
          where: { id: parseInt(id) },
          data: {
            date: new Date(date),
            start_time,
            end_time,
            description,
            teacher_id: teacher_id || undefined,
          },
          include: {
            teacher: {
              select: {
                name: true,
              },
            },
          },
        });

        // Get all students in the class
        const students = await prisma.student.findMany({
          where: { class_id: updated.class_id },
          select: { user_id: true },
        });

        // Get all admin users
        const adminUserIds = await getAdminUserIds(prisma);

        // Create notification for students about the update
        await createGroupNotification(
          prisma,
          students.map((s) => s.user_id),
          `Extra class for ${updated.subject} has been updated - New schedule: ${date} from ${start_time} to ${end_time}`,
          "extra_class"
        );

        // Create notification for admins about the update
        await createGroupNotification(
          prisma,
          adminUserIds,
          `Extra class for ${updated.class_id} - ${updated.subject} has been updated - New schedule: ${date} from ${start_time} to ${end_time}. Teacher: ${updated.teacher.name}`,
          "extra_class"
        );

        // If teacher was changed, notify the new teacher
        if (teacher_id && teacher_id !== extraClass.teacher_id) {
          await prisma.notification.create({
            data: {
              user_id: teacher_id,
              message: `You have been assigned to teach an extra class for ${updated.subject} on ${date} from ${start_time} to ${end_time}`,
              type: "extra_class",
            },
          });
        }

        return updated;
      });

      res.json(updatedExtraClass);
    } catch (error) {
      console.error("Error updating extra class:", error);
      res.status(500).json({ error: "Failed to update extra class" });
    }
  }
);

module.exports = router;
