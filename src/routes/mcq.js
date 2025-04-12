const express = require("express");
const router = express.Router();
const multer = require("multer");
const { authMiddleware } = require("../middleware/authMiddleware");
const { checkRole } = require("../middleware/attendanceMiddleware");
const {
  createMCQQuestion,
  bulkCreateMCQQuestions,
  getMCQQuestions,
  startMCQSession,
  submitAnswer,
  endSession,
  getSessionResults,
  getStudentSessions,
  getTeacherSessions,
  getChapters,
  getStudentProgress,
  getClassStatistics,
  loadNextBatch,
} = require("../controllers/mcqController");

// Configure multer to use memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.FILE_UPLOAD_LIMIT_MCQ) || 5242880, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

// Teacher routes for managing questions
router.post(
  "/questions",
  authMiddleware(["admin", "teacher"]),
  checkRole("teacher", "admin"),
  upload.single("image"),
  createMCQQuestion
);

router.post(
  "/questions/bulk",
  authMiddleware(["admin", "teacher"]),
  checkRole("teacher", "admin"),
  upload.array("images"),
  bulkCreateMCQQuestions
);

// Routes for fetching questions and chapters
router.get(
  "/questions",
  authMiddleware(["admin", "teacher", "student"]),
  getMCQQuestions
);

router.get(
  "/chapters",
  authMiddleware(["admin", "teacher", "student"]),
  getChapters
);

// Student routes for taking MCQ tests
router.post(
  "/sessions/start",
  authMiddleware(["student"]),
  checkRole("student"),
  startMCQSession
);

router.post(
  "/sessions/submit-answer",
  authMiddleware(["student"]),
  checkRole("student"),
  submitAnswer
);

router.post(
  "/sessions/end",
  authMiddleware(["student"]),
  checkRole("student"),
  endSession
);

// Get session results
router.get(
  "/sessions/:session_id",
  authMiddleware(["student", "teacher"]),
  getSessionResults
);

// Get student sessions
router.get(
  "/sessions",
  authMiddleware(["student"]),
  checkRole("student"),
  getStudentSessions
);

// Get student progress
router.get(
  "/student-progress",
  authMiddleware(["student"]),
  checkRole("student"),
  getStudentProgress
);

// Teacher session management routes
router.get(
  "/teacher/sessions",
  authMiddleware(["teacher"]),
  checkRole("teacher"),
  getTeacherSessions
);

// Get class statistics
router.get(
  "/class-statistics",
  authMiddleware(["teacher", "admin"]),
  getClassStatistics
);

// Load next batch of questions
router.post(
  "/sessions/next-batch",
  authMiddleware(["student"]),
  checkRole("student"),
  loadNextBatch
);

module.exports = router;
