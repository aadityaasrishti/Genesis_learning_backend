const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/authMiddleware");
const {
  createDailyChallenge,
  getStudentChallenges,
  submitChallenge,
  getTeacherChallenges,
  getAdminChallenges,
  gradeSubjectiveAnswer,
} = require("../controllers/dailyChallengeController");

// Admin routes
router.get("/admin", authMiddleware(["admin"]), getAdminChallenges);

// Teacher routes
router.post("/", authMiddleware(["teacher"]), createDailyChallenge);
router.get("/teacher", authMiddleware(["teacher"]), getTeacherChallenges);
router.post("/grade", authMiddleware(["teacher"]), gradeSubjectiveAnswer);

// Student routes
router.get("/student", authMiddleware(["student"]), getStudentChallenges);
router.post("/submit", authMiddleware(["student"]), submitChallenge);

module.exports = router;
