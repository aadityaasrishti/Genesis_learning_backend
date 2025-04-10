const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const jwt = require("jsonwebtoken");
const { authMiddleware } = require("../middleware/authMiddleware");
const { prisma } = require("../config/prisma");
const {
  createAssignment,
  getAssignments,
  submitAssignment,
  getSubmissions,
  gradeSubmission,
  updateAssignment,
  deleteAssignment,
} = require("../controllers/assignmentController");

// Error handling wrapper
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch((error) => {
    console.error("Assignment route error:", {
      method: req.method,
      path: req.path,
      error: error.message,
      stack: error.stack,
    });
    next(error);
  });
};

const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"), false);
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});

// Routes for teachers
router.post(
  "/",
  authMiddleware(["teacher", "admin", "support_staff"]),
  upload.single("file"),
  asyncHandler(createAssignment)
);
router.get(
  "/submissions/:assignment_id",
  authMiddleware(["teacher", "admin", "support_staff"]),
  asyncHandler(getSubmissions)
);
router.get(
  "/submission/:submission_id",
  authMiddleware(["teacher", "admin", "support_staff"]), // Added admin role
  asyncHandler(async (req, res) => {
    try {
      const { submission_id } = req.params;

      console.log("Fetching submission details for ID:", submission_id);

      const submission = await prisma.assignmentSubmission.findUnique({
        where: { id: parseInt(submission_id) },
        include: {
          student: true,
          assignment: true,
        },
      });

      if (!submission) {
        console.log("No submission found for ID:", submission_id);
        return res.status(404).json({
          success: false,
          message: "Submission not found",
        });
      }

      console.log("Successfully found submission:", submission.id);

      // Get the student details since they're on the User model
      const student = await prisma.user.findUnique({
        where: { user_id: submission.student_id },
        select: {
          name: true,
          email: true,
        },
      });

      // Check if submission is late
      const isLate =
        new Date(submission.submitted_at) >
        new Date(submission.assignment.due_date);

      // Format the submission to match the frontend interface
      const formattedSubmission = {
        id: submission.id,
        assignment_id: submission.assignment_id,
        student_id: submission.student_id,
        file_url: submission.file_url,
        text_response: submission.text_response,
        submitted_at: submission.submitted_at,
        grade: submission.grade,
        teacher_comment: submission.teacher_comment,
        graded_at: submission.graded_at,
        student: {
          name: student?.name,
          email: student?.email,
        },
        assignment: submission.assignment,
        isLate,
        submissionStatus: isLate ? "late" : "on time",
      };

      res.json(formattedSubmission);
    } catch (error) {
      console.error("Error fetching submission details:", {
        error: error.message,
        stack: error.stack,
        submissionId: req.params.submission_id,
      });
      res.status(500).json({
        success: false,
        message: "Error fetching submission details",
        error: error.message,
      });
    }
  })
);

// Add new grading route
router.post(
  "/submission/:submission_id/grade",
  authMiddleware(["teacher", "admin", "support_staff"]),
  asyncHandler(gradeSubmission)
);

router.put(
  "/:id",
  authMiddleware(["teacher", "admin", "support_staff"]),
  upload.single("file"),
  asyncHandler(updateAssignment)
);

router.delete(
  "/:id",
  authMiddleware(["teacher", "admin", "support_staff"]),
  asyncHandler(deleteAssignment)
);

// Routes for both teachers and students
router.get(
  "/",
  authMiddleware(["teacher", "student", "support_staff"]),
  asyncHandler(getAssignments)
);

// Routes for students
router.post(
  "/:assignment_id/submit",
  authMiddleware(["student"]),
  upload.single("file"),
  asyncHandler(submitAssignment)
);

// Route for downloading assignment files
router.get(
  "/download/:filename",
  authMiddleware(["teacher", "student", "admin", "support_staff"]), // Added admin role
  asyncHandler(async (req, res) => {
    const { filename } = req.params;
    const filePath = path.join(
      __dirname,
      "../../uploads/assignments",
      filename
    );

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.sendFile(filePath);
  })
);

// Download submission file
router.get(
  "/submission-file/:filename",
  authMiddleware(["teacher", "student", "admin", "support_staff"]),
  asyncHandler(async (req, res) => {
    const { filename } = req.params;
    const filePath = path.join(
      __dirname,
      "../../uploads/assignments",
      filename
    );

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.sendFile(filePath);
  })
);

// Add admin-specific route
router.get(
  "/admin",
  authMiddleware(["admin", "support_staff"]),
  asyncHandler(async (req, res) => {
    try {
      const { class_id, subject } = req.query;

      const queryOptions = {
        where: {},
        include: {
          submissions: {
            include: {
              student: {
                select: {
                  name: true,
                  email: true,
                },
              },
            },
          },
          teacher: {
            select: {
              name: true,
            },
          },
        },
        orderBy: { created_at: "desc" },
      };

      if (class_id) {
        queryOptions.where.class_id = class_id;
      }
      if (subject) {
        queryOptions.where.subject = subject;
      }

      const assignments = await prisma.assignment.findMany(queryOptions);

      // Process assignments to include submission status
      const processedAssignments = assignments.map((assignment) => {
        const dueDate = new Date(assignment.due_date);

        return {
          ...assignment,
          submissions: assignment.submissions.map((submission) => ({
            ...submission,
            isLate: new Date(submission.submitted_at) > dueDate,
            submissionStatus:
              new Date(submission.submitted_at) > dueDate ? "late" : "on time",
          })),
        };
      });

      res.json({ success: true, assignments: processedAssignments });
    } catch (error) {
      console.error("Admin assignments fetch error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching assignments",
        error: error.message,
      });
    }
  })
);

module.exports = router;
