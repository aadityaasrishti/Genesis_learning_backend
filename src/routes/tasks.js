const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/authMiddleware");
const multer = require("multer");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// Configure multer to use memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.FILE_UPLOAD_LIMIT_TASKS) || 5242880, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept image files
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed!"), false);
    }
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
        where: {
          role: "teacher",
          is_active: true,
        },
        include: {
          teacher: true,
        },
        orderBy: {
          name: "asc",
        },
      });

      const formattedTeachers = teachers.map((teacher) => ({
        user_id: teacher.user_id,
        name: teacher.name,
        subject: teacher.teacher?.subject,
        class_assigned: teacher.teacher?.class_assigned,
      }));

      res.json(formattedTeachers);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch teachers" });
    }
  }
);

module.exports = router;
