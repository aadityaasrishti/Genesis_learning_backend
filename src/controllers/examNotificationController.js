const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const path = require("path");
const fs = require("fs").promises;

const createExamNotification = async (req, res) => {
  try {
    console.log("Request body:", req.body);
    console.log("File received:", req.file);
    const { title, subject, exam_date, description, reuseSyllabus } = req.body;
    const student_id = req.user.user_id;

    // Validate required fields
    if (!title || !subject || !exam_date) {
      return res.status(400).json({
        error: "Missing required fields",
        details: "Title, subject, and exam date are required",
      });
    }

    // Validate exam date
    const examDate = new Date(exam_date);
    if (isNaN(examDate.getTime())) {
      return res.status(400).json({
        error: "Invalid exam date format",
      });
    }

    // Get student data with subject validation
    const student = await prisma.user.findUnique({
      where: { user_id: student_id },
      include: { student: true },
    });

    if (!student?.student?.subjects) {
      return res.status(400).json({ error: "No subjects found for student" });
    }

    const enrolledSubjects = student.student.subjects
      .split(",")
      .map((s) => s.trim());
    if (!enrolledSubjects.includes(subject)) {
      return res.status(400).json({
        error: "Not enrolled in this subject",
        details: `${subject} is not in your enrolled subjects: ${enrolledSubjects.join(
          ", "
        )}`,
      });
    }

    // Handle syllabus file upload
    let syllabus_url = null;
    if (req.file) {
      try {
        const uploadDir = path.join(__dirname, "../../uploads/syllabi");
        await fs.mkdir(uploadDir, { recursive: true });

        const fileName = `${Date.now()}-${req.file.originalname}`;
        const filePath = path.join(uploadDir, fileName);
        await fs.writeFile(filePath, req.file.buffer);
        syllabus_url = `/uploads/syllabi/${fileName}`;

        // Create exam notification
        const notification = await prisma.examNotification.create({
          data: {
            student_id,
            title,
            subject,
            exam_date: examDate,
            description: description || "",
            syllabus_url,
          },
        });

        // If reuseSyllabus is true, create notifications for other subjects
        if (reuseSyllabus === "true") {
          // Filter out the current subject
          const otherSubjects = enrolledSubjects.filter((s) => s !== subject);
          if (otherSubjects.length > 0) {
            await prisma.examNotification.createMany({
              data: otherSubjects.map((subj) => ({
                student_id,
                title,
                subject: subj,
                exam_date: examDate,
                description: description || "",
                syllabus_url,
              })),
            });
          }
        }

        // Notify the subject teacher
        const teacher = await prisma.user.findFirst({
          where: {
            role: "teacher",
            teacher: {
              subject: { contains: subject },
              class_assigned: { contains: student.student.class },
            },
          },
        });

        if (teacher) {
          await prisma.notification.create({
            data: {
              user_id: teacher.user_id,
              message: `New exam notification from ${
                student.name || "a student"
              } for ${subject} scheduled on ${examDate.toLocaleDateString()}`,
              type: "exam_notification",
            },
          });
        }

        res.status(201).json(notification);
      } catch (error) {
        console.error("Error processing exam notification:", error);
        return res.status(500).json({
          error: "Failed to process exam notification",
          details: error.message,
        });
      }
    } else {
      // Create notification without syllabus
      const notification = await prisma.examNotification.create({
        data: {
          student_id,
          title,
          subject,
          exam_date: examDate,
          description: description || "",
        },
      });

      res.status(201).json(notification);
    }
  } catch (error) {
    console.error("Error creating exam notification:", error);
    res.status(500).json({
      error: "Failed to create exam notification",
      details: error.message,
    });
  }
};

const getExamNotifications = async (req, res) => {
  try {
    const { role, user_id, class: userClass } = req.user;

    let notifications;
    if (role === "student") {
      // Students see their own notifications
      notifications = await prisma.examNotification.findMany({
        where: { student_id: user_id },
        orderBy: { exam_date: "asc" },
      });
    } else if (role === "teacher") {
      // Teachers see notifications from their subjects and assigned classes
      const teacher = await prisma.teacher.findUnique({
        where: { user_id },
      });

      if (!teacher) {
        return res.status(404).json({ error: "Teacher not found" });
      }

      const teacherSubjects = teacher.subject.split(",").map((s) => s.trim());
      const teacherClasses = teacher.class_assigned
        .split(",")
        .map((c) => c.trim());

      notifications = await prisma.examNotification.findMany({
        where: {
          AND: [
            { subject: { in: teacherSubjects } },
            {
              student: {
                class: { in: teacherClasses },
              },
            },
          ],
        },
        include: {
          student: {
            select: {
              name: true,
              class: true,
            },
          },
        },
        orderBy: { exam_date: "asc" },
      });
    }

    res.json(notifications);
  } catch (error) {
    console.error("Error fetching exam notifications:", error);
    res.status(500).json({
      error: "Failed to fetch exam notifications",
      details: error.message,
    });
  }
};

const deleteExamNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const user_id = req.user.user_id;

    // Find the notification
    const notification = await prisma.examNotification.findUnique({
      where: { id: parseInt(id) },
    });

    if (!notification) {
      return res.status(404).json({ error: "Notification not found" });
    }

    // Check ownership
    if (notification.student_id !== user_id) {
      return res.status(403).json({
        error: "You don't have permission to delete this notification",
      });
    }

    // Delete syllabus file if exists
    if (notification.syllabus_url) {
      const filePath = path.join(
        __dirname,
        "../../uploads/syllabi",
        notification.syllabus_url.split("/").pop() || ""
      );
      try {
        await fs.unlink(filePath);
      } catch (error) {
        console.error("Error deleting syllabus file:", error);
      }
    }

    // Delete the notification
    await prisma.examNotification.delete({
      where: { id: parseInt(id) },
    });

    res.json({ message: "Exam notification deleted successfully" });
  } catch (error) {
    console.error("Error deleting exam notification:", error);
    res.status(500).json({
      error: "Failed to delete exam notification",
      details: error.message,
    });
  }
};

module.exports = {
  createExamNotification,
  getExamNotifications,
  deleteExamNotification,
};
