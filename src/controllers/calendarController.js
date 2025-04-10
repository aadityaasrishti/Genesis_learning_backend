const { prisma } = require("../config/prisma");
const { createAssignmentNotifications } = require("../utils/notificationUtils");

const getCalendarEvents = async (req, res) => {
  try {
    const { startDate, endDate, role, userId, class_id } = req.query;

    // Parse filter arrays from query params
    const eventTypes = req.query.eventTypes
      ? req.query.eventTypes.split(",")
      : [];
    const subjects = req.query.subjects ? req.query.subjects.split(",") : [];

    const start = new Date(startDate);
    const end = new Date(endDate);

    let events = [];

    // Get holidays with consistent color coding if requested
    if (!eventTypes.length || eventTypes.includes("holiday")) {
      const holidays = await prisma.holiday.findMany({
        where: {
          date: {
            gte: start,
            lte: end,
          },
        },
      });
      events = [
        ...events,
        ...holidays.map((holiday) => ({
          id: `holiday-${holiday.id}`,
          title: holiday.name,
          start: holiday.date,
          end: holiday.date,
          description: holiday.description,
          backgroundColor: "#ff4444",
          borderColor: "#cc0000",
          textColor: "#ffffff",
          type: "holiday",
          allDay: true,
          className: "holiday",
        })),
      ];
    }

    // Get assignments based on role if requested
    if (!eventTypes.length || eventTypes.includes("assignment")) {
      let assignments = [];
      const assignmentWhere = {
        due_date: {
          gte: start,
          lte: end,
        },
        ...(subjects.length > 0 && { subject: { in: subjects } }),
        ...(class_id && { class_id: class_id }),
      };

      if (role === "teacher") {
        assignments = await prisma.assignment.findMany({
          where: {
            ...assignmentWhere,
            teacher_id: parseInt(userId),
          },
          include: { submissions: true },
        });
      } else if (role === "student") {
        assignments = await prisma.assignment.findMany({
          where: {
            ...assignmentWhere,
            assigned_students: { contains: userId.toString() },
          },
          include: { submissions: true },
        });
      } else if (role === "admin" || role === "support_staff") {
        // Add support for admin and support staff to view all assignments
        assignments = await prisma.assignment.findMany({
          where: assignmentWhere,
          include: {
            submissions: true,
            teacher: {
              select: { name: true },
            },
          },
        });
      }

      const formattedAssignments = assignments.map((assignment) => {
        const totalStudents = assignment.assigned_students.split(",").length;
        const submittedCount = assignment.submissions.length;
        const isOverdue = new Date() > new Date(assignment.due_date);
        let status = "pending";
        if (role === "student") {
          status = assignment.submissions.some(
            (s) => s.student_id.toString() === userId
          )
            ? "submitted"
            : "pending";
        }

        const submissionStats =
          role === "teacher" || role === "admin" || role === "support_staff"
            ? `Submissions: ${submittedCount}/${totalStudents} students`
            : "";

        const teacherName = assignment.teacher?.name
          ? `Teacher: ${assignment.teacher.name}`
          : "";

        const description = [
          assignment.description,
          submissionStats,
          role === "admin" || role === "support_staff" ? teacherName : "",
          `Class: ${assignment.class_id}`,
          `Subject: ${assignment.subject}`,
        ]
          .filter(Boolean)
          .join("\n");

        return {
          id: `assignment-${assignment.id}`,
          title: `Assignment: ${assignment.title}`,
          start: assignment.created_at,
          end: assignment.due_date,
          description,
          backgroundColor:
            isOverdue && status === "pending" ? "#ff9800" : "#2196F3",
          borderColor:
            isOverdue && status === "pending" ? "#f57c00" : "#1976D2",
          textColor: "#ffffff",
          type: "assignment",
          className: "assignment",
          status,
          subject: assignment.subject,
          classId: assignment.class_id,
          dueDate: assignment.due_date,
          submissionStats: { total: totalStudents, submitted: submittedCount },
        };
      });
      events = [...events, ...formattedAssignments];
    }

    // Get exam notifications
    if (!eventTypes.length || eventTypes.includes("exam")) {
      let examNotifications = [];
      const examWhere = {
        exam_date: {
          gte: start,
          lte: end,
        },
        ...(subjects.length > 0 && { subject: { in: subjects } }),
      };

      if (role === "student") {
        const student = await prisma.student.findFirst({
          where: { user_id: parseInt(userId) },
        });
        if (student) {
          examNotifications = await prisma.examNotification.findMany({
            where: {
              ...examWhere,
              student_id: parseInt(userId),
            },
          });
        }
      }

      const formattedExams = examNotifications.map((exam) => ({
        id: `exam-${exam.id}`,
        title: `${exam.title} (${exam.subject})`,
        start: exam.exam_date,
        end: exam.exam_date,
        description: exam.description || "",
        type: "exam",
        className: "exam",
        subject: exam.subject,
        syllabus_url: exam.syllabus_url,
        allDay: true,
      }));
      events = [...events, ...formattedExams];
    }

    // Get extra classes based on role if requested
    if (!eventTypes.length || eventTypes.includes("extra-class")) {
      let extraClasses = [];
      const extraClassWhere = {
        date: {
          gte: start,
          lte: end,
        },
        ...(subjects.length > 0 && { subject: { in: subjects } }),
      };

      if (role === "teacher") {
        extraClasses = await prisma.extraClass.findMany({
          where: {
            ...extraClassWhere,
            teacher_id: parseInt(userId),
          },
          include: {
            teacher: { select: { name: true } },
          },
        });
      } else if (role === "student") {
        const student = await prisma.student.findFirst({
          where: { user_id: parseInt(userId) },
        });
        if (student) {
          extraClasses = await prisma.extraClass.findMany({
            where: {
              ...extraClassWhere,
              class_id: student.class_id,
            },
            include: {
              teacher: { select: { name: true } },
            },
          });
        }
      } else if (role === "admin" || role === "support_staff") {
        extraClasses = await prisma.extraClass.findMany({
          where: extraClassWhere,
          include: {
            teacher: { select: { name: true } },
          },
        });
      }

      const formattedExtraClasses = extraClasses.map((extraClass) => ({
        id: `extra-class-${extraClass.id}`,
        title: `${extraClass.subject} (Extra Class)`,
        start: `${extraClass.date.toISOString().split("T")[0]}T${
          extraClass.start_time
        }`,
        end: `${extraClass.date.toISOString().split("T")[0]}T${
          extraClass.end_time
        }`,
        description: extraClass.description,
        teacher: extraClass.teacher.name,
        subject: extraClass.subject,
        classId: extraClass.class_id,
        backgroundColor: "#4CAF50",
        borderColor: "#388E3C",
        textColor: "#ffffff",
        type: "extra-class",
        className: "extra-class",
      }));
      events = [...events, ...formattedExtraClasses];
    }

    res.json({
      success: true,
      events,
    });
  } catch (error) {
    console.error("Calendar events error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching calendar events",
      error: error.message,
    });
  }
};

module.exports = {
  getCalendarEvents,
};
