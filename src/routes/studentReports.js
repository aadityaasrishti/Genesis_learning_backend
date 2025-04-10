const express = require("express");
const { prisma } = require("../config/prisma");
const { authMiddleware } = require("../middleware/authMiddleware");
const router = express.Router();

const CACHE_DURATION = 5 * 60; // 5 minutes in seconds

// Helper to set cache headers
const setCacheHeaders = (res) => {
  res.set("Cache-Control", `private, max-age=${CACHE_DURATION}`);
  res.set(
    "Expires",
    new Date(Date.now() + CACHE_DURATION * 1000).toUTCString()
  );
};

// Get all students by class
router.get(
  "/class/:classId",
  authMiddleware(["admin", "teacher"]),
  async (req, res) => {
    const startTime = Date.now();
    try {
      const { classId } = req.params;
      if (!classId) {
        return res.status(400).json({ error: "Class ID is required" });
      }

      console.log(`[StudentReports] Fetching students for class: ${classId}`);
      const formattedClassId = classId.startsWith("Class ")
        ? classId
        : `Class ${classId}`;

      const students = await prisma.student.findMany({
        where: { class_id: formattedClassId },
        select: {
          user_id: true,
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      });

      const formattedStudents = students.map((student) => ({
        id: student.user_id,
        user: {
          name: student.user.name,
          email: student.user.email,
        },
      }));

      const duration = Date.now() - startTime;
      console.log(
        `[StudentReports] Found ${students.length} students for class ${classId}. Duration: ${duration}ms`
      );

      setCacheHeaders(res);
      res.json(formattedStudents);
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(
        `[StudentReports] Error fetching students (${duration}ms):`,
        error
      );
      res.status(500).json({ error: "Failed to fetch students" });
    }
  }
);

// Get comprehensive report for a student
router.get(
  "/student/:studentId",
  authMiddleware(["admin", "teacher", "student"]),
  async (req, res) => {
    const startTime = Date.now();
    const timings = {};

    try {
      const { studentId } = req.params;
      if (!studentId || isNaN(parseInt(studentId))) {
        return res.status(400).json({ error: "Valid student ID is required" });
      }

      console.log(
        `[StudentReports] Generating report for student ID: ${studentId}`
      );
      const parsedStudentId = parseInt(studentId);

      // Get basic student info with efficient select
      const studentStartTime = Date.now();
      const student = await prisma.student.findUnique({
        where: { user_id: parsedStudentId },
        select: {
          user: {
            select: {
              name: true,
              email: true,
              class: true,
            },
          },
          guardian_name: true,
          fee_structure: {
            select: {
              amount: true,
              payment_type: true,
            },
          },
          fee_structure_id: true,
          fee_payments: {
            orderBy: { payment_date: "desc" },
            select: {
              payment_date: true,
              amount_paid: true,
              payment_mode: true,
              payment_status: true,
              receipt_number: true,
              discount_reason: true,
              month: true,
            },
          },
          fee_reminders: {
            orderBy: { reminder_date: "desc" },
            take: 5,
            select: {
              reminder_date: true,
              reminder_type: true,
              message: true,
            },
          },
          fee_due_date: true,
        },
      });
      timings.studentInfo = Date.now() - studentStartTime;

      if (!student) {
        console.log(`[StudentReports] Student not found: ${studentId}`);
        return res.status(404).json({ error: "Student not found" });
      }

      // Calculate fee summary with null checks
      const feeSummary = {
        total_fee: student.fee_structure?.amount || 0,
        total_paid:
          student.fee_payments?.reduce(
            (sum, p) => sum + (p.amount_paid || 0),
            0
          ) || 0,
        payment_history: student.fee_payments || [],
        recent_reminders: student.fee_reminders || [],
        due_date: student.fee_due_date,
      };
      feeSummary.total_due = Math.max(
        0,
        feeSummary.total_fee - feeSummary.total_paid
      );
      feeSummary.payment_status =
        feeSummary.total_due === 0 ? "PAID" : "PENDING";

      // Get attendance records for current academic year only
      const startOfYear = new Date();
      startOfYear.setMonth(startOfYear.getMonth() - 12); // Last 12 months

      const dataStartTime = Date.now();
      const [
        attendance,
        extraClassAttendance,
        testSubmissions,
        mcqSessions,
        assignments,
        examResults,
        dailyChallenges,
      ] = await Promise.allSettled([
        prisma.attendance.findMany({
          where: {
            user_id: parsedStudentId,
            date: { gte: startOfYear },
          },
          orderBy: { date: "desc" },
          select: {
            date: true,
            subject: true,
            status: true,
          },
        }),

        prisma.attendance.findMany({
          where: {
            user_id: parsedStudentId,
            extra_class_id: { not: null },
            date: { gte: startOfYear },
          },
          select: {
            date: true,
            subject: true,
            status: true,
            extra_class: {
              select: {
                description: true,
              },
            },
          },
          orderBy: { date: "desc" },
        }),

        prisma.testSubmission.findMany({
          where: { student_id: parsedStudentId },
          select: {
            grade: true,
            test: {
              select: {
                title: true,
                subject: true,
                startTime: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        }),

        prisma.mCQSession.findMany({
          where: { student_id: parsedStudentId },
          select: {
            subject: true,
            chapter: true,
            start_time: true,
            correct_count: true,
            incorrect_count: true,
          },
          orderBy: { start_time: "desc" },
        }),

        prisma.assignmentSubmission.findMany({
          where: { student_id: parsedStudentId },
          select: {
            grade: true,
            submitted_at: true,
            assignment: {
              select: {
                title: true,
                subject: true,
                due_date: true,
              },
            },
          },
          orderBy: { submitted_at: "desc" },
        }),

        prisma.examResult.findMany({
          where: { student_id: parsedStudentId },
          select: {
            id: true,
            subject: true,
            exam_type: true,
            marks: true,
            total_marks: true,
            percentage: true,
            grade: true,
            exam_date: true,
            remarks: true,
          },
          orderBy: { exam_date: "desc" },
        }),

        prisma.dailyChallengeSubmission.findMany({
          where: {
            student_id: parsedStudentId,
            submitted_at: { gte: startOfYear },
          },
          select: {
            score: true,
            submitted_at: true,
            challenge: {
              select: {
                title: true,
                subject: true,
              },
            },
          },
          orderBy: { submitted_at: "desc" },
        }),
      ]);
      timings.data = Date.now() - dataStartTime;

      // Process Promise.allSettled results with error handling
      const getData = (result) =>
        result.status === "fulfilled" ? result.value : [];

      const totalDuration = Date.now() - startTime;
      console.log(
        `[StudentReports] Report generated for student ${studentId}:`,
        {
          duration: totalDuration,
          timings,
          counts: {
            attendance: getData(attendance).length,
            extraClassAttendance: getData(extraClassAttendance).length,
            testSubmissions: getData(testSubmissions).length,
            mcqSessions: getData(mcqSessions).length,
            assignments: getData(assignments).length,
            feePayments: student.fee_payments?.length || 0,
            examResults: getData(examResults).length,
          },
        }
      );

      setCacheHeaders(res);
      res.json({
        student: {
          user: {
            name: student.user?.name || "Unknown",
            email: student.user?.email,
            class: student.user?.class,
          },
          guardian_name: student.guardian_name,
          fee_structure_id: student.fee_structure_id,
        },
        feeSummary,
        attendance: getData(attendance),
        extraClassAttendance: getData(extraClassAttendance),
        testSubmissions: getData(testSubmissions),
        mcqSessions: getData(mcqSessions),
        assignments: getData(assignments),
        examResults: getData(examResults),
        dailyChallenges: getData(dailyChallenges),
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(
        `[StudentReports] Error generating report (${duration}ms):`,
        error
      );
      res.status(500).json({
        error: "Failed to generate student report",
        details: error.message,
      });
    }
  }
);

module.exports = router;
