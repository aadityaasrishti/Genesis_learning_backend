const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// Upload exam result
const uploadExamResult = async (req, res) => {
  try {
    const { subject, exam_type, marks, total_marks, grade, remarks } = req.body;
    const student_id = req.user.user_id;

    // Validate required fields
    if (!subject || !exam_type || !marks || !total_marks) {
      return res.status(400).json({
        error: "Missing required fields",
        details: "Subject, exam type, marks, and total marks are required",
      });
    }

    // Validate if student is enrolled in this subject
    const student = await prisma.student.findUnique({
      where: { user_id: student_id },
      select: { subjects: true },
    });

    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }

    const enrolledSubjects = student.subjects.split(",").map((s) => s.trim());
    if (!enrolledSubjects.includes(subject)) {
      return res.status(400).json({
        error: "Invalid subject",
        details: "You can only upload results for subjects you are enrolled in",
      });
    }

    // Calculate percentage
    const percentage = (parseFloat(marks) / parseFloat(total_marks)) * 100;

    const examResult = await prisma.examResult.create({
      data: {
        student_id,
        subject,
        exam_type,
        marks: parseFloat(marks),
        total_marks: parseFloat(total_marks),
        percentage,
        grade,
        exam_date: new Date(),
        remarks,
      },
    });

    res.status(201).json(examResult);
  } catch (error) {
    console.error("Error uploading exam result:", error);
    res.status(500).json({ error: "Failed to upload exam result" });
  }
};

// Get student's exam results
const getStudentResults = async (req, res) => {
  try {
    const { studentId } = req.params;

    // Students can only view their own results
    if (
      req.user.role === "student" &&
      req.user.user_id !== parseInt(studentId)
    ) {
      return res
        .status(403)
        .json({ error: "You can only view your own exam results" });
    }

    // Get exam results
    const examResults = await prisma.examResult.findMany({
      where: { student_id: parseInt(studentId) },
      orderBy: [{ subject: "asc" }, { exam_date: "desc" }],
    });

    // Group by subject
    const groupedResults = examResults.reduce((acc, result) => {
      if (!acc[result.subject]) {
        acc[result.subject] = [];
      }
      acc[result.subject].push(result);
      return acc;
    }, {});

    // Calculate overall summary
    const summary = calculatePerformanceSummary(examResults);

    res.json({
      results: groupedResults,
      summary,
    });
  } catch (error) {
    console.error("Error fetching exam results:", error);
    res.status(500).json({ error: "Failed to fetch exam results" });
  }
};

// Get results for all students in a class (teacher/admin only)
const getClassResults = async (req, res) => {
  try {
    const { classId } = req.params;
    let { subject } = req.query;

    // Normalize subject
    subject = subject ? subject.trim().toLowerCase() : "";

    let teacherSubjects = [];
    // For teachers, verify they teach this class and subject
    if (req.user.role === "teacher") {
      const teacher = await prisma.teacher.findFirst({
        where: { user_id: req.user.user_id },
        select: {
          class_assigned: true,
          subject: true,
        },
      });

      if (!teacher) {
        return res.status(404).json({ error: "Teacher not found" });
      }

      const teacherClasses = teacher.class_assigned
        ? teacher.class_assigned.split(",").map((c) => c.trim())
        : [];
      teacherSubjects = teacher.subject
        ? teacher.subject.split(",").map((s) => s.trim().toLowerCase())
        : [];

      if (!teacherClasses.includes(classId)) {
        return res
          .status(403)
          .json({ error: "You don't have access to this class" });
      }

      if (subject && !teacherSubjects.includes(subject)) {
        return res
          .status(403)
          .json({ error: "You don't have access to this subject" });
      }
    }

    // Get all students in the class first
    const students = await prisma.student.findMany({
      where: {
        class_id: classId,
      },
      select: {
        user_id: true,
        subjects: true,
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    // For teachers, only get results for students in their subjects
    const allowedStudentIds = students
      .filter((student) => {
        if (req.user.role !== "teacher") return true;

        const studentSubjects = student.subjects
          ? student.subjects.split(",").map((s) => s.trim().toLowerCase())
          : [];
        // If subject is specified, only include students taking that subject
        // Otherwise, include all students taking any of teacher's subjects
        if (subject) {
          return studentSubjects.includes(subject);
        }
        return studentSubjects.some((s) => teacherSubjects.includes(s));
      })
      .map((s) => s.user_id);

    // Get exam results for these students
    const examResults = await prisma.examResult.findMany({
      where: {
        student_id: {
          in: allowedStudentIds,
        },
        ...(subject && {
          subject: {
            contains: subject,
          },
        }),
      },
      orderBy: [{ subject: "asc" }, { exam_date: "desc" }],
    });

    // Group by student and only include allowed students
    const groupedResults = students
      .filter((student) => allowedStudentIds.includes(student.user_id))
      .reduce((acc, student) => {
        acc[student.user_id] = {
          student: {
            id: student.user_id,
            name: student.user.name,
            email: student.user.email,
          },
          results: examResults.filter(
            (result) => result.student_id === student.user_id
          ),
        };
        return acc;
      }, {});

    res.json(Object.values(groupedResults));
  } catch (error) {
    console.error("Error fetching class results:", error);
    res.status(500).json({ error: "Failed to fetch class results" });
  }
};

// Helper function to calculate performance summary
const calculatePerformanceSummary = (results) => {
  if (!results.length) return null;

  const summary = {
    overall_average: 0,
    highest_score: 0,
    lowest_score: 100,
  };

  results.forEach((result) => {
    summary.overall_average += result.percentage;
    summary.highest_score = Math.max(summary.highest_score, result.percentage);
    summary.lowest_score = Math.min(summary.lowest_score, result.percentage);
  });

  summary.overall_average = summary.overall_average / results.length;

  return summary;
};

module.exports = {
  uploadExamResult,
  getStudentResults,
  getClassResults,
};
