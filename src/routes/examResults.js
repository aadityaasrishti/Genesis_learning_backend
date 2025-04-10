const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/authMiddleware");
const { prisma } = require("../config/prisma");
const {
  uploadExamResult,
  getStudentResults,
  getClassResults,
} = require("../controllers/examResultController");

// Upload exam result
router.post("/upload", authMiddleware(["student"]), uploadExamResult);

// Get exam results for a student
router.get(
  "/student/:studentId",
  authMiddleware(["admin", "teacher", "student"]),
  getStudentResults
);

// Get exam results for a class
router.get(
  "/class/:classId",
  authMiddleware(["admin", "teacher"]),
  getClassResults
);

module.exports = router;
