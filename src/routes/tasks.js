const express = require("express");
const fs = require("fs");
const path = require("path");
const router = express.Router();
const { authMiddleware } = require("../middleware/authMiddleware");
const multer = require("multer");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
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

// Create uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, "../../uploads/student-requests");

// Ensure upload directory exists
try {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  // Test write permissions
  fs.accessSync(uploadDir, fs.constants.W_OK);
} catch (error) {
  console.error("Upload directory error:", error);
  // Create the directory with full permissions
  fs.mkdirSync(uploadDir, { recursive: true, mode: 0o777 });
}

// Configure multer for image upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  // Accept only image files
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed!"), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
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
