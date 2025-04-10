const express = require("express");
const router = express.Router();
const testController = require("../controllers/testController");
const { authMiddleware } = require("../middleware/authMiddleware");
const { uploadFile } = require("../middleware/fileUpload");
const path = require("path");

// File serving middleware
const serveFile = (dir) => (req, res, next) => {
  if (!req.params.filename) {
    return next();
  }
  const filePath = path.join(dir, req.params.filename);
  res.sendFile(filePath, (err) => {
    if (err) {
      next(err);
    }
  });
};

// Get tests (different routes for teachers and students)
router.get("/teacher", authMiddleware(["teacher"]), testController.getTeacherTests);
router.get("/available", authMiddleware(["student"]), testController.getStudentTests);

// Create test (teacher only)
router.post("/", authMiddleware(["teacher"]), uploadFile, testController.createTest);

// Get test content (for students)
router.get("/:testId/content", authMiddleware(["student", "teacher"]), testController.getTestContent);

// Get test submissions (teacher only)
router.get("/:testId/submissions", authMiddleware(["teacher"]), testController.getTestSubmissions);

// Get submission content
router.get("/submissions/:submissionId/content", authMiddleware(["student", "teacher"]), testController.getSubmissionContent);

// Submit test (student only)
router.post("/submit", authMiddleware(["student"]), uploadFile, testController.submitTest);

// Grade submission (teacher only)
router.post("/submissions/:submissionId/grade", authMiddleware(["teacher"]), testController.gradeSubmission);

// Delete test (teacher only)
router.delete("/:testId", authMiddleware(["teacher"]), testController.deleteTest);

// Delete submission (teacher only)
router.delete("/submissions/:submissionId", authMiddleware(["teacher"]), testController.deleteSubmission);

// Get available students for test assignment
router.get("/available-students", authMiddleware(["teacher"]), testController.getAvailableStudents);

// Reset compromised test for a student
router.post("/:testId/reset-compromise/:studentId", authMiddleware(["teacher"]), testController.resetCompromisedTest);

module.exports = router;
