const express = require("express");
const router = express.Router();
const calendarController = require("../controllers/calendarController");
const { authMiddleware } = require("../middleware/authMiddleware");

// Protected calendar routes
router.get("/events", authMiddleware(["admin", "teacher", "student", "support_staff"]), calendarController.getCalendarEvents);

module.exports = router;
