const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/authMiddleware");
const multer = require("multer");
const {
  createStudentRequest,
  getStudentRequests,
  getAllStudentRequests,
  updateRequestStatus,
  deleteStudentRequest,
  createTask,
  updateTaskStatus,
  getTeacherTasks,
  getAllTasks,
} = require("../controllers/taskController");

// Configure multer to use memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    // Accept only image files
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed!"), false);
    }
  },
  limits: {
    fileSize: parseInt(process.env.FILE_UPLOAD_LIMIT_TASKS) || 5242880, // Default to 5MB if not set
  },
});

// Error handling middleware for multer
const handleUpload = (req, res, next) => {
  upload.single("image")(req, res, function (err) {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res
          .status(400)
          .json({ error: "File is too large. Maximum size is 5MB." });
      }
      return res.status(400).json({ error: err.message });
    } else if (err) {
      console.error("File upload error:", err);
      return res
        .status(500)
        .json({ error: "File upload failed", details: err.message });
    }
    next();
  });
};

// Student request routes
router.get(
  "/student/requests/all",
  authMiddleware(["admin", "support_staff"]),
  getAllStudentRequests
);

router.get(
  "/student/requests",
  authMiddleware(["student"]),
  getStudentRequests
);

router.post(
  "/student/requests",
  authMiddleware(["student"]),
  handleUpload,
  createStudentRequest
);

router.patch(
  "/student/requests/:id/status",
  authMiddleware(["admin", "support_staff"]),
  (req, res, next) => {
    if (!req.body.status) {
      return res.status(400).json({ error: "Status is required" });
    }
    next();
  },
  updateRequestStatus
);

router.delete(
  "/student/requests/:id",
  authMiddleware(["admin", "support_staff", "student"]),
  deleteStudentRequest
);

// Teacher task routes
router.post("/tasks", authMiddleware(["admin", "support_staff"]), createTask);
router.patch(
  "/tasks/:id/status",
  authMiddleware(["teacher", "admin"]),
  updateTaskStatus
);
router.get("/tasks/my-tasks", authMiddleware(["teacher"]), getTeacherTasks);
router.get("/tasks", authMiddleware(["admin", "support_staff"]), getAllTasks);

// Get teachers list
router.get(
  "/users/teachers",
  authMiddleware(["admin", "support_staff"]),
  async (req, res) => {
    try {
      const teachers = await prisma.user.findMany({
        where: { role: "TEACHER" },
        select: {
          user_id: true,
          name: true,
        },
      });
      res.json(teachers);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch teachers list" });
    }
  }
);

module.exports = router;
