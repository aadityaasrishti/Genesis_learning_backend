const { prisma } = require("../config/prisma");

const checkRole = (...allowedRoles) => {
  return (req, res, next) => {
    const userRole = req.user?.role;

    if (!userRole || !allowedRoles.includes(userRole)) {
      return res.status(403).json({
        error:
          "Access denied. You don't have permission to perform this action.",
      });
    }

    next();
  };
};

const validateAttendanceData = (req, res, next) => {
  const { classId, date, attendance, subject } = req.body;

  if (
    !classId ||
    !date ||
    !attendance ||
    !Array.isArray(attendance) ||
    !subject
  ) {
    return res.status(400).json({
      error:
        "Invalid attendance data format. Required fields: classId, date, attendance array, and subject",
    });
  }

  // Validate attendance status values
  const validStatuses = ["PRESENT", "ABSENT", "LATE"];
  const invalidAttendance = attendance.find(
    (record) => !validStatuses.includes(record.status)
  );

  if (invalidAttendance) {
    return res.status(400).json({
      error:
        "Invalid attendance status. Valid values are: PRESENT, ABSENT, LATE",
    });
  }

  // Validate subject exists for the class
  const validateSubject = async () => {
    try {
      const students = await prisma.student.findFirst({
        where: {
          class_id: classId,
          subjects: {
            contains: subject,
          },
        },
      });

      if (!students) {
        return res.status(400).json({
          error: "Invalid subject for the selected class",
        });
      }

      next();
    } catch (error) {
      console.error("Error validating subject:", error);
      res.status(500).json({ error: "Failed to validate subject" });
    }
  };

  validateSubject();
};

// Check if user has permission to view/edit attendance for a specific class
exports.checkClassAccess = async (req, res, next) => {
  try {
    const { classId } = req.query;
    if (!classId) {
      return res.status(400).json({ error: "Class ID is required" });
    }

    const user = req.user;

    // Admin has access to all classes
    if (user.role === "admin") {
      return next();
    }

    // Teachers can only access their assigned classes
    if (user.role === "teacher") {
      const teacher = await prisma.teacher.findUnique({
        where: { user_id: user.user_id },
      });

      if (!teacher || !teacher.class_assigned.split(",").includes(classId)) {
        return res
          .status(403)
          .json({ error: "You don't have access to this class" });
      }
    }

    // Support staff has access to all classes for attendance marking
    if (user.role === "support_staff") {
      return next();
    }

    // Students can only access their own class
    if (user.role === "student") {
      const student = await prisma.student.findUnique({
        where: { user_id: user.user_id },
      });

      if (!student || student.class_id !== classId) {
        return res
          .status(403)
          .json({ error: "You don't have access to this class" });
      }
    }

    next();
  } catch (error) {
    console.error("Error checking class access:", error);
    res.status(500).json({ error: "Failed to verify class access" });
  }
};

// Validate date range parameters
exports.validateDateRange = (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const today = new Date();

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({ error: "Invalid date format" });
      }

      if (start > end) {
        return res
          .status(400)
          .json({ error: "Start date cannot be after end date" });
      }

      if (end > today) {
        return res.status(400).json({ error: "Cannot select future dates" });
      }

      // Limit date range to 6 months to prevent performance issues
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      if (start < sixMonthsAgo) {
        return res.status(400).json({
          error: "Date range cannot exceed 6 months",
        });
      }
    }

    next();
  } catch (error) {
    console.error("Error validating date range:", error);
    res.status(400).json({ error: "Invalid date parameters" });
  }
};

// Validate subject access
exports.checkSubjectAccess = async (req, res, next) => {
  try {
    const { subject } = req.query;
    const user = req.user;

    if (!subject) {
      return res.status(400).json({ error: "Subject parameter is required" });
    }

    // Admin and support staff have access to all subjects
    if (["admin", "support_staff"].includes(user.role)) {
      return next();
    }

    // For teachers, check both User and Teacher models
    if (user.role === "teacher") {
      const teacher = await prisma.user.findUnique({
        where: { user_id: user.user_id },
        include: {
          teacher: true,
        },
      });

      const userSubjects = (teacher.subjects || "")
        .split(",")
        .map((s) => s.trim().toLowerCase());
      const teacherSubjects = (teacher.teacher?.subject || "")
        .split(",")
        .map((s) => s.trim().toLowerCase());
      const allSubjects = [...new Set([...userSubjects, ...teacherSubjects])];

      if (!allSubjects.includes(subject.toLowerCase())) {
        return res
          .status(403)
          .json({ error: "You don't have access to this subject" });
      }
    }

    // For students, check both User and Student models
    if (user.role === "student") {
      const student = await prisma.user.findUnique({
        where: { user_id: user.user_id },
        include: {
          student: true,
        },
      });

      const userSubjects = (student.subjects || "")
        .split(",")
        .map((s) => s.trim().toLowerCase());
      const studentSubjects = (student.student?.subjects || "")
        .split(",")
        .map((s) => s.trim().toLowerCase());
      const allSubjects = [...new Set([...userSubjects, ...studentSubjects])];

      if (!allSubjects.includes(subject.toLowerCase())) {
        return res
          .status(403)
          .json({ error: "You don't have access to this subject" });
      }
    }

    next();
  } catch (error) {
    console.error("Error checking subject access:", error);
    res.status(500).json({ error: "Failed to verify subject access" });
  }
};

module.exports = {
  checkRole,
  validateAttendanceData,
  checkClassAccess: exports.checkClassAccess,
  validateDateRange: exports.validateDateRange,
  checkSubjectAccess: exports.checkSubjectAccess,
};
