const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/authMiddleware");
const {
  createFeedback,
  getFeedbacks,
  deleteFeedback,
  getFeedbackCount,
} = require("../controllers/feedbackController");

// All routes require authentication
router.use(authMiddleware(["admin", "teacher", "student", "support_staff"]));

// Create new feedback
router.post("/", createFeedback);

// Get feedbacks (filtered based on user role)
router.get("/", getFeedbacks);

// Get feedback count
router.get("/count", getFeedbackCount);

// Delete feedback (soft delete)
router.delete("/:id", deleteFeedback);

module.exports = router;
