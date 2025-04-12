const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/authMiddleware");
const multer = require("multer");
const path = require("path");
const {
  createExamNotification,
  getExamNotifications,
  deleteExamNotification,
} = require("../controllers/examNotificationController");

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(), // Use memory storage to handle files in buffer
  limits: {
    fileSize:
      parseInt(process.env.FILE_UPLOAD_LIMIT_EXAM_NOTIFICATION) || 5242880,
  }, // Default to 5MB if not set
  fileFilter: (req, file, cb) => {
    console.log("Received file:", file); // Add debug logging
    // Accept PDFs and common image formats
    if (
      file.mimetype === "application/pdf" ||
      file.mimetype.startsWith("image/")
    ) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF and image files are allowed"), false);
    }
  },
}).single("syllabus"); // Ensure middleware is configured correctly

// Wrap multer error handling
const handleUpload = (req, res, next) => {
  upload(req, res, function (err) {
    if (err instanceof multer.MulterError) {
      // A Multer error occurred when uploading
      console.error("Multer error:", err);
      return res.status(400).json({
        error: err.message,
        code: err.code,
      });
    } else if (err) {
      // An unknown error occurred
      console.error("Unknown upload error:", err);
      return res.status(500).json({
        error: "File upload failed",
        details: err.message,
      });
    }
    // Everything went fine
    next();
  });
};

// Routes
router.post(
  "/student/exam-notifications",
  authMiddleware(["student"]),
  handleUpload,
  createExamNotification
);

router.get(
  "/student/exam-notifications",
  authMiddleware(["student", "teacher"]),
  getExamNotifications
);

router.delete(
  "/student/exam-notifications/:id",
  authMiddleware(["student"]),
  deleteExamNotification
);

// Note: Download route removed as files are now served directly from Supabase storage

module.exports = router;
