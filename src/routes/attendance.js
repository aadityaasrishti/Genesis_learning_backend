const express = require("express");
const router = express.Router();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { authMiddleware } = require("../middleware/authMiddleware");
const { parseCsv } = require("../utils/csvParser");
const multer = require("multer");
const upload = multer();

// Add role-based middleware
const checkRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "Access denied" });
    }
    next();
  };
};

// Validate date parameters middleware
const validateDateParams = () => {
  return async (req, res, next) => {
    const { startDate, endDate, date } = req.query;
    try {
      if (
        startDate &&
        !isNaN(new Date(startDate).getTime()) &&
        endDate &&
        !isNaN(new Date(endDate).getTime())
      ) {
        if (new Date(startDate) > new Date(endDate)) {
          throw new Error("Start date cannot be after end date");
        }
      }
      if (date && !isNaN(new Date(date).getTime())) {
        const isValid = await isValidAttendanceDate(new Date(date));
        if (!isValid) {
          throw new Error("Invalid attendance date");
        }
      }
      next();
    } catch (error) {
      return res
        .status(400)
        .json({ error: error.message || "Invalid date parameters" });
    }
  };
};

// Enhanced isValidAttendanceDate function to check holidays
const isValidAttendanceDate = async (date, isExtraClass = false) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);

  if (date > today) return false;

  // For regular attendance, check for Sunday (0)
  // Skip weekend check for extra classes
  if (!isExtraClass) {
    const day = date.getDay();
    if (day === 0) return false;
  }

  // For regular attendance, check holidays
  // Skip holiday check for extra classes
  if (!isExtraClass) {
    const holiday = await prisma.holiday.findFirst({
      where: {
        date: {
          equals: date,
        },
      },
    });

    if (holiday) return false;
  }

  return true;
};

// Get all unique class IDs from students table
router.get(
  "/classes",
  authMiddleware(["admin", "teacher", "student", "support_staff"]),
  async (req, res) => {
    try {
      const uniqueClasses = await prisma.student.findMany({
        distinct: ["class_id"],
        select: { class_id: true },
      });

      res.json(uniqueClasses.map((cls) => cls.class_id));
    } catch (error) {
      console.error("Error fetching classes:", error);
      res.status(500).json({ error: "Failed to fetch classes" });
    }
  }
);

// Get classes for a specific teacher
router.get(
  "/teacher/classes",
  authMiddleware(["admin", "teacher", "student", "support_staff"]),
  checkRole("teacher", "admin"),
  async (req, res) => {
    const teacherId = req.user.user_id;

    try {
      if (req.user.role === "admin") {
        // For admin, return all classes
        const allClasses = await prisma.student.findMany({
          distinct: ["class_id"],
          select: { class_id: true },
        });
        return res.json(allClasses.map((cls) => cls.class_id));
      }

      // For teachers, get their assigned classes
      const teacher = await prisma.teacher.findUnique({
        where: {
          user_id: teacherId,
        },
        select: {
          class_assigned: true,
          subject: true,
        },
      });

      if (!teacher) {
        return res.status(404).json({ error: "Teacher not found" });
      }

      // Convert comma-separated classes to array
      const classes = teacher.class_assigned
        ? teacher.class_assigned.split(",").map((cls) => cls.trim())
        : [];

      res.json(classes);
    } catch (error) {
      console.error("Error fetching teacher classes:", error);
      res.status(500).json({ error: "Failed to fetch classes" });
    }
  }
);

// Get students by class and subject
router.get(
  "/students",
  authMiddleware(["admin", "teacher", "student", "support_staff"]),
  async (req, res) => {
    const { classId, subject } = req.query;
    console.log("Fetching students with params:", { classId, subject });

    try {
      // Find all students in the class
      const students = await prisma.student.findMany({
        where: {
          class_id: classId,
        },
        include: {
          user: {
            select: {
              name: true,
              attendances: {
                where: {
                  date: {
                    gte: new Date(new Date().setHours(0, 0, 0, 0)),
                    lt: new Date(new Date().setHours(23, 59, 59, 999)),
                  },
                },
              },
            },
          },
        },
      });

      console.log("Found students:", students);

      // Filter students based on subject and transform data
      const filteredStudents = students
        .filter((student) => {
          if (!subject) return true;
          return (
            student.subjects &&
            student.subjects
              .split(",")
              .map((s) => s.trim().toLowerCase())
              .includes(subject.toLowerCase())
          );
        })
        .map((student) => ({
          user_id: student.user_id,
          name: student.user.name,
          class_id: student.class_id,
          subjects: student.subjects,
          // Return all attendance records for the current date
          attendances: student.user.attendances,
        }));

      console.log("Filtered and transformed students:", filteredStudents);
      res.json(filteredStudents);
    } catch (error) {
      console.error("Error fetching students:", error);
      res
        .status(500)
        .json({ error: "Failed to fetch students: " + error.message });
    }
  }
);

// Mark attendance
router.post(
  "/mark",
  authMiddleware(["admin", "teacher", "student", "support_staff"]),
  async (req, res) => {
    const { attendanceRecords } = req.body;
    console.log("Received attendance records:", attendanceRecords);

    if (!attendanceRecords || attendanceRecords.length === 0) {
      return res.status(400).json({ error: "No attendance records provided" });
    }

    const recordedBy = req.user.user_id;

    try {
      // Use transaction to ensure atomic operation
      const result = await prisma.$transaction(async (prisma) => {
        // Process each record
        for (const record of attendanceRecords) {
          try {
            await prisma.attendance.deleteMany({
              where: {
                user_id: record.user_id,
                date: {
                  gte: new Date(new Date(record.date).setHours(0, 0, 0, 0)),
                  lt: new Date(new Date(record.date).setHours(23, 59, 59, 999)),
                },
                subject: record.subject,
              },
            });

            await prisma.attendance.create({
              data: {
                user_id: record.user_id,
                status: record.status,
                subject: record.subject,
                recorded_by: recordedBy,
                date: new Date(record.date),
              },
            });
          } catch (err) {
            console.error("Error processing record:", record, err);
            throw err;
          }
        }

        return { count: attendanceRecords.length };
      });

      console.log("Successfully marked attendance:", result);
      res.json({
        success: true,
        message: "Attendance marked successfully",
        result,
      });
    } catch (error) {
      console.error("Error marking attendance:", error);
      res.status(500).json({
        error: "Failed to mark attendance",
        details: error.message,
      });
    }
  }
);

// Mark attendance for extra class
router.post(
  "/mark-extra",
  authMiddleware(["admin", "teacher", "student", "support_staff"]),
  checkRole("admin", "support_staff", "staff"),
  async (req, res) => {
    const { attendanceRecords } = req.body;
    const recorded_by = req.user.user_id;

    try {
      // Validate attendance records
      if (
        !attendanceRecords ||
        !Array.isArray(attendanceRecords) ||
        attendanceRecords.length === 0
      ) {
        return res
          .status(400)
          .json({ error: "No attendance records provided" });
      }

      // Validate the extra class exists and is on the same date
      const firstRecord = attendanceRecords[0];
      if (!firstRecord?.extra_class_id) {
        return res.status(400).json({ error: "Extra class ID is required" });
      }

      const extraClass = await prisma.extraClass.findUnique({
        where: { id: firstRecord.extra_class_id },
      });

      if (!extraClass) {
        return res.status(404).json({ error: "Extra class not found" });
      }

      // Create all attendance records in a transaction
      const result = await prisma.$transaction(
        attendanceRecords.map((record) =>
          prisma.attendance.upsert({
            where: {
              user_id_date_subject: {
                user_id: record.user_id,
                date: new Date(extraClass.date),
                subject: extraClass.subject,
              },
            },
            update: {
              status: record.status,
              recorded_by,
              extra_class_id: firstRecord.extra_class_id,
            },
            create: {
              user_id: record.user_id,
              date: new Date(extraClass.date),
              subject: extraClass.subject,
              status: record.status,
              recorded_by,
              extra_class_id: firstRecord.extra_class_id,
            },
          })
        )
      );

      res.json({
        success: true,
        message: "Extra class attendance marked successfully",
      });
    } catch (error) {
      console.error("Error marking extra class attendance:", error);
      res.status(500).json({ error: "Failed to mark attendance" });
    }
  }
);

// Get attendance report by date range and class
router.get(
  "/report",
  authMiddleware(["admin", "teacher", "student", "support_staff"]),
  async (req, res) => {
    const { classId, month, year } = req.query;

    try {
      // Calculate date range for the specified month and year
      const startDate = new Date(Number(year), Number(month) - 1, 1);
      const endDate = new Date(Number(year), Number(month), 0);

      const attendanceReport = await prisma.student.findMany({
        where: {
          class_id: classId,
        },
        include: {
          user: {
            select: {
              name: true,
              attendances: {
                where: {
                  date: {
                    gte: startDate,
                    lte: endDate,
                  },
                },
              },
            },
          },
        },
      });

      // Calculate attendance statistics
      const reportWithStats = attendanceReport.map((student) => {
        const totalDays = attendanceReport[0].user.attendances.length;
        const presentDays = student.user.attendances.filter(
          (a) => a.status === "PRESENT"
        ).length;
        const attendancePercentage =
          totalDays > 0 ? (presentDays / totalDays) * 100 : 0;

        return {
          studentId: student.user_id,
          name: student.user.name,
          presentDays,
          totalDays,
          attendancePercentage: attendancePercentage.toFixed(2),
        };
      });

      res.json(reportWithStats);
    } catch (error) {
      console.error("Error generating attendance report:", error);
      res.status(500).json({ error: "Failed to generate attendance report" });
    }
  }
);

// Get attendance by student ID
router.get(
  "/student/:studentId",
  authMiddleware(["admin", "teacher", "student", "support_staff"]),
  validateDateParams(),
  async (req, res) => {
    const { studentId } = req.params;
    const { startDate, endDate } = req.query;

    // Validate that students can only view their own attendance
    if (
      req.user.role === "student" &&
      parseInt(req.params.studentId) !== req.user.user_id
    ) {
      return res.status(403).json({ error: "Access denied" });
    }

    try {
      const attendance = await prisma.attendance.findMany({
        where: {
          user_id: parseInt(studentId),
          date: {
            gte: startDate ? new Date(startDate) : undefined,
            lte: endDate ? new Date(endDate) : undefined,
          },
        },
        orderBy: {
          date: "desc",
        },
      });

      res.json(attendance);
    } catch (error) {
      console.error("Error fetching student attendance:", error);
      res.status(500).json({ error: "Failed to fetch student attendance" });
    }
  }
);

// Get subjects for a teacher
router.get(
  "/teachers/subjects",
  authMiddleware(["admin", "teacher", "student", "support_staff"]),
  checkRole("admin", "teacher"),
  async (req, res) => {
    const teacherId = req.user.user_id;
    const { classId } = req.query;

    if (!classId) {
      return res.status(400).json({ error: "Class ID is required" });
    }

    try {
      if (req.user.role === "admin") {
        // For admin, return all subjects from students in the specified class
        const students = await prisma.student.findMany({
          where: {
            class_id: classId,
          },
          select: {
            subjects: true,
          },
        });

        const uniqueSubjects = new Set();
        students.forEach((student) => {
          if (student.subjects) {
            student.subjects
              .split(",")
              .map((s) => s.trim())
              .forEach((subject) => uniqueSubjects.add(subject));
          }
        });

        return res.json(Array.from(uniqueSubjects));
      }

      // For teachers, get their assigned subjects and filter by class
      const teacher = await prisma.teacher.findUnique({
        where: {
          user_id: teacherId,
        },
        select: {
          subject: true,
          class_assigned: true,
        },
      });

      if (!teacher) {
        return res.status(404).json({ error: "Teacher not found" });
      }

      // Check if teacher is assigned to this class
      const teacherClasses = teacher.class_assigned
        ? teacher.class_assigned.split(",").map((c) => c.trim())
        : [];

      if (!teacherClasses.includes(classId)) {
        return res
          .status(403)
          .json({ error: "You don't have access to this class" });
      }

      // Get teacher's subjects
      const teacherSubjects = teacher.subject
        ? teacher.subject.split(",").map((s) => s.trim())
        : [];

      // Get all subjects taught in this class
      const students = await prisma.student.findMany({
        where: {
          class_id: classId,
        },
        select: {
          subjects: true,
        },
      });

      // Filter subjects to only include those that both the teacher teaches and are taught in the class
      const classSubjects = new Set();
      students.forEach((student) => {
        if (student.subjects) {
          student.subjects
            .split(",")
            .map((s) => s.trim())
            .filter((subject) => teacherSubjects.includes(subject))
            .forEach((subject) => classSubjects.add(subject));
        }
      });

      res.json(Array.from(classSubjects));
    } catch (error) {
      console.error("Error fetching teacher subjects:", error);
      res.status(500).json({ error: "Failed to fetch subjects" });
    }
  }
);

// Get subjects for a specific class
router.get(
  "/subjects",
  authMiddleware(["admin", "teacher", "student", "support_staff"]),
  checkRole("admin", "teacher", "support_staff"),
  async (req, res) => {
    const { classId } = req.query;

    if (!classId) {
      return res.status(400).json({ error: "Class ID is required" });
    }

    try {
      let query = {
        where: {
          class_id: classId,
        },
        select: {
          subjects: true,
        },
      };

      // If the user is a teacher, only show their assigned subjects
      if (req.user.role === "teacher") {
        const teacher = await prisma.teacher.findUnique({
          where: {
            user_id: req.user.user_id,
          },
          select: {
            subject: true,
            class_assigned: true,
          },
        });

        if (!teacher) {
          return res.status(404).json({ error: "Teacher not found" });
        }

        // Check if teacher is assigned to this class
        const teacherClasses = teacher.class_assigned
          ? teacher.class_assigned.split(",").map((c) => c.trim())
          : [];

        if (!teacherClasses.includes(classId)) {
          return res
            .status(403)
            .json({ error: "You don't have access to this class" });
        }

        const teacherSubjects = teacher.subject
          ? teacher.subject.split(",").map((s) => s.trim().toLowerCase())
          : [];

        const students = await prisma.student.findMany(query);

        // Extract subjects and filter based on teacher's subjects
        const allSubjects = new Set();
        students.forEach((student) => {
          if (student.subjects) {
            student.subjects
              .split(",")
              .map((s) => s.trim().toLowerCase())
              .filter((subject) => teacherSubjects.includes(subject))
              .forEach((subject) => allSubjects.add(subject));
          }
        });

        return res.json(Array.from(allSubjects));
      }

      // For admin and support staff, return all subjects in the class
      const students = await prisma.student.findMany(query);

      const subjects = new Set();
      students.forEach((student) => {
        if (student.subjects) {
          student.subjects
            .split(",")
            .map((s) => s.trim())
            .forEach((subject) => subjects.add(subject));
        }
      });

      res.json(Array.from(subjects));
    } catch (error) {
      console.error("Error fetching subjects:", error);
      res.status(500).json({ error: "Failed to fetch subjects" });
    }
  }
);

// Get detailed attendance report with statistics
router.get(
  "/detailed-report",
  authMiddleware(["admin", "teacher", "student", "support_staff"]),
  checkRole("admin", "teacher", "support_staff"),
  validateDateParams(),
  async (req, res) => {
    const { startDate, endDate, classId, subject } = req.query;

    try {
      // Check teacher permissions for the class and subject
      if (req.user.role === "teacher") {
        const teacher = await prisma.teacher.findUnique({
          where: { user_id: req.user.user_id },
          select: {
            subject: true,
            class_assigned: true,
          },
        });

        if (!teacher) {
          return res.status(404).json({ error: "Teacher not found" });
        }

        const teacherClasses = teacher.class_assigned
          ? teacher.class_assigned.split(",").map((c) => c.trim())
          : [];
        const teacherSubjects = teacher.subject
          ? teacher.subject.split(",").map((s) => s.trim().toLowerCase())
          : [];

        if (!teacherClasses.includes(classId)) {
          return res
            .status(403)
            .json({ error: "You don't have access to this class" });
        }

        if (!teacherSubjects.includes(subject.toLowerCase())) {
          return res
            .status(403)
            .json({ error: "You don't have access to this subject" });
        }
      }

      // Get all students in the class with the specified subject
      const studentsInClass = await prisma.student.findMany({
        where: {
          class_id: classId,
          subjects: {
            contains: subject,
          },
        },
        select: {
          user_id: true,
        },
      });

      const studentIds = studentsInClass.map((s) => s.user_id);
      const totalStudents = studentIds.length;

      // Get all dates between start and end date
      const start = new Date(startDate);
      const end = new Date(endDate);
      const dates = [];
      for (let dt = new Date(start); dt <= end; dt.setDate(dt.getDate() + 1)) {
        dates.push(new Date(dt));
      }

      // Get attendance for each date
      const dailyRecords = await Promise.all(
        dates.map(async (date) => {
          const dayStart = new Date(date.setHours(0, 0, 0, 0));
          const dayEnd = new Date(date.setHours(23, 59, 59, 999));

          const dayAttendance = await prisma.attendance.findMany({
            where: {
              date: {
                gte: dayStart,
                lte: dayEnd,
              },
              subject: subject,
              user_id: {
                in: studentIds,
              },
            },
            include: {
              user: {
                select: {
                  name: true,
                },
              },
            },
          });

          const present_count = dayAttendance.filter(
            (a) => a.status === "PRESENT"
          ).length;
          const absent_count = totalStudents - dayAttendance.length;
          const late_count = dayAttendance.filter(
            (a) => a.status === "LATE"
          ).length;

          return {
            date: dayStart.toISOString(),
            total_students: totalStudents,
            present_count,
            absent_count,
            late_count,
            attendance_percentage:
              totalStudents > 0
                ? ((present_count + late_count) / totalStudents) * 100
                : 0,
            students: dayAttendance.map((a) => ({
              name: a.user.name,
              status: a.status,
            })),
          };
        })
      );

      // Filter out Sundays and holidays
      const holidays = await prisma.holiday.findMany({
        where: {
          date: {
            gte: start,
            lte: end,
          },
        },
      });

      const holidayDates = holidays.map(
        (h) => h.date.toISOString().split("T")[0]
      );

      const filteredRecords = dailyRecords.filter((record) => {
        const date = new Date(record.date);
        const isSunday = date.getDay() === 0;
        const isHoliday = holidayDates.includes(record.date.split("T")[0]);
        return !isSunday && !isHoliday;
      });

      res.json({
        daily_records: filteredRecords,
      });
    } catch (error) {
      console.error("Error generating detailed report:", error);
      res.status(500).json({ error: "Failed to generate detailed report" });
    }
  }
);

// Get student-wise attendance report
router.get(
  "/student-wise-report",
  authMiddleware(["admin", "teacher", "student", "support_staff"]),
  checkRole("admin", "teacher", "support_staff"),
  async (req, res) => {
    const { classId, startDate, endDate, studentQuery } = req.query;

    try {
      // Input validation
      if (!classId || !startDate || !endDate || !studentQuery) {
        return res.status(400).json({ error: "Missing required parameters" });
      }

      // Find student by ID or name in the specified class
      const student = await prisma.student.findFirst({
        where: {
          class_id: classId,
          OR: [
            {
              user_id: !isNaN(studentQuery)
                ? parseInt(studentQuery)
                : undefined,
            },
            {
              user: {
                name: {
                  contains: studentQuery,
                },
              },
            },
          ],
        },
        include: {
          user: {
            select: {
              name: true,
            },
          },
        },
      });

      if (!student) {
        return res.status(404).json({
          error: "Student not found in the specified class",
          params: { classId, studentQuery },
        });
      }

      // Calculate working days (excluding Sundays and holidays)
      const start = new Date(startDate);
      const end = new Date(endDate);

      // Validate dates
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({ error: "Invalid date format" });
      }

      if (start > end) {
        return res
          .status(400)
          .json({ error: "Start date cannot be after end date" });
      }

      // Get holidays between dates
      const holidays = await prisma.holiday.findMany({
        where: {
          date: {
            gte: start,
            lte: end,
          },
        },
      });

      const holidayDates = holidays.map(
        (h) => h.date.toISOString().split("T")[0]
      );
      let workingDays = 0;

      // Calculate working days excluding Sundays and holidays
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const isSunday = d.getDay() === 0;
        const isHoliday = holidayDates.includes(d.toISOString().split("T")[0]);
        if (!isSunday && !isHoliday) {
          workingDays++;
        }
      }

      // Get all subjects for the student
      const studentSubjects = student.subjects
        ? student.subjects.split(",").map((s) => s.trim())
        : [];

      // Get attendance for each subject
      const subjectAttendance = {};

      await Promise.all(
        studentSubjects.map(async (subject) => {
          const attendance = await prisma.attendance.findMany({
            where: {
              user_id: student.user_id,
              subject: subject,
              date: {
                gte: start,
                lte: end,
              },
            },
          });

          const present = attendance.filter(
            (a) => a.status === "PRESENT"
          ).length;
          const late = attendance.filter((a) => a.status === "LATE").length;
          const absent = workingDays - present - late;

          subjectAttendance[subject] = {
            total: workingDays,
            present,
            absent,
            late,
            percentage:
              workingDays > 0 ? ((present + late) / workingDays) * 100 : 0,
          };
        })
      );

      // Return the response
      res.json({
        studentId: student.user_id,
        name: student.user.name,
        subjects: subjectAttendance,
      });
    } catch (error) {
      console.error("Error generating student-wise report:", error);
      res.status(500).json({
        error: "Failed to generate student-wise report",
        details: error.message,
      });
    }
  }
);

// Export attendance data as CSV
router.get(
  "/export",
  authMiddleware(["admin", "teacher", "student", "support_staff"]),
  checkRole("admin", "teacher", "support_staff"),
  validateDateParams(),
  async (req, res) => {
    const { startDate, endDate, classId, subject } = req.query;

    // Add proper CSV escaping
    const escapeCsvValue = (value) => {
      if (value === null || value === undefined) return "";
      return `"${value.toString().replace(/"/g, '""')}"`;
    };

    try {
      const attendanceData = await prisma.attendance.findMany({
        where: {
          date: {
            gte: new Date(startDate),
            lte: new Date(endDate),
          },
          subject: subject,
          user: {
            student: {
              class_id: classId,
            },
          },
        },
        include: {
          user: {
            select: {
              name: true,
              student: {
                select: {
                  class_id: true,
                },
              },
            },
          },
        },
        orderBy: [{ date: "asc" }, { user: { name: "asc" } }],
      });

      // Format data for CSV with proper escaping
      const csvRows = [["Date", "Student Name", "Class", "Subject", "Status"]];

      attendanceData.forEach((record) => {
        csvRows.push([
          record.date.toLocaleDateString(),
          escapeCsvValue(record.user.name),
          escapeCsvValue(record.user.student.class_id),
          escapeCsvValue(record.subject),
          record.status,
        ]);
      });

      // Convert to CSV string
      const csvContent = csvRows.map((row) => row.join(",")).join("\n");

      // Set headers for file download
      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=attendance_report_${classId}_${subject}.csv`
      );

      res.send(csvContent);
    } catch (error) {
      console.error("Error exporting attendance:", error);
      res.status(500).json({ error: "Failed to export attendance data" });
    }
  }
);

// Holiday management routes
router.post(
  "/holidays",
  authMiddleware(["admin", "teacher", "student", "support_staff"]),
  checkRole("admin"),
  async (req, res) => {
    const { date, name, description, type } = req.body;

    try {
      const holiday = await prisma.holiday.create({
        data: {
          date: new Date(date),
          name,
          description,
          type,
        },
      });
      res.json(holiday);
    } catch (error) {
      console.error("Error creating holiday:", error);
      res.status(500).json({ error: "Failed to create holiday" });
    }
  }
);

router.get(
  "/holidays",
  authMiddleware(["admin", "teacher", "student", "support_staff"]),
  async (req, res) => {
    const { startDate, endDate } = req.query;

    try {
      const holidays = await prisma.holiday.findMany({
        where: {
          date: {
            gte: startDate ? new Date(startDate) : undefined,
            lte: endDate ? new Date(endDate) : undefined,
          },
        },
        orderBy: {
          date: "asc",
        },
      });
      res.json(holidays);
    } catch (error) {
      console.error("Error fetching holidays:", error);
      res.status(500).json({ error: "Failed to fetch holidays" });
    }
  }
);

router.delete(
  "/holidays/:id",
  authMiddleware(["admin", "teacher", "student", "support_staff"]),
  checkRole("admin"),
  async (req, res) => {
    const { id } = req.params;

    try {
      await prisma.holiday.delete({
        where: {
          id: parseInt(id),
        },
      });
      res.json({ message: "Holiday deleted successfully" });
    } catch (error) {
      console.error("Error deleting holiday:", error);
      res.status(500).json({ error: "Failed to delete holiday" });
    }
  }
);

module.exports = router;
