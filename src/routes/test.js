const express = require("express");
const router = express.Router();
const testController = require("../controllers/testController");
const authMiddleware = require("../middleware/authMiddleware");
const { uploadFile } = require("../middleware/fileUpload");
const path = require("path");
const fs = require("fs");
const busboy = require("busboy");
const crypto = require("crypto");

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(process.cwd(), "uploads");
const SUBMISSIONS_DIR = path.join(UPLOADS_DIR, "submissions");
const TESTS_DIR = path.join(UPLOADS_DIR, "tests");

// Create directories if they don't exist
[UPLOADS_DIR, SUBMISSIONS_DIR, TESTS_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Debug middleware to log request details
router.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  console.log("Headers:", req.headers);
  next();
});

// Generate unique filename
const generateUniqueFilename = (originalname) => {
  const timestamp = Date.now();
  const random = crypto.randomBytes(8).toString("hex");
  const ext = path.extname(originalname);
  return `${timestamp}-${random}${ext}`;
};

// Custom file upload middleware
const handleFileUpload = (req, res, next) => {
  if (req.method !== "POST") {
    return next();
  }

  const isTestCreation = !req.url.includes("/submit");
  const uploadDir = isTestCreation ? TESTS_DIR : SUBMISSIONS_DIR;

  const bb = busboy({
    headers: req.headers,
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB
      files: 1,
    },
  });

  let fields = {};
  let filePromise = null;

  bb.on("file", (name, file, info) => {
    if (!info.filename) {
      return res.status(400).json({ error: "No file provided" });
    }

    const uniqueFilename = generateUniqueFilename(info.filename);
    const saveTo = path.join(uploadDir, uniqueFilename);

    console.log(`File upload - saving to: ${saveTo}, field name: ${name}`);

    const writeStream = fs.createWriteStream(saveTo);

    filePromise = new Promise((resolve, reject) => {
      file.on("limit", () => {
        fs.unlink(saveTo, () => {});
        reject(new Error("File size limit exceeded (max 50MB)"));
      });

      writeStream.on("error", (err) => {
        console.error("Write stream error:", err);
        fs.unlink(saveTo, () => {});
        reject(new Error("Error saving file: " + err.message));
      });

      writeStream.on("finish", () => {
        resolve({
          filename: uniqueFilename,
          originalname: info.filename,
          mimetype: info.mimeType,
          path: saveTo,
        });
      });

      file.pipe(writeStream);
    });
  });

  bb.on("field", (name, val) => {
    console.log("Received field:", name, val);
    fields[name] = val;
  });

  bb.on("finish", async () => {
    try {
      // For test creation, file is optional (TEXT type tests)
      if (!filePromise && !isTestCreation) {
        throw new Error("No file was uploaded");
      }

      // If there's a file upload, wait for it to complete
      if (filePromise) {
        const fileData = await filePromise;
        // For test creation, use pdf field name
        fields[isTestCreation ? "pdf" : "file"] = fileData;
      }

      console.log("Upload complete, fields:", fields);
      req.body = fields;
      next();
    } catch (err) {
      console.error("Upload error:", err);
      res.status(400).json({
        error: err.message,
        details:
          "File upload failed. Please ensure you've selected a file and it's under 50MB.",
      });
    }
  });

  bb.on("error", (err) => {
    console.error("Busboy error:", err);
    res.status(400).json({
      error: "File upload failed: " + err.message,
    });
  });

  req.pipe(bb);
};

// Test content access requires authentication
router.get(
  "/submissions/:submissionId/content",
  authMiddleware(),
  testController.getSubmissionContent
);
router.get("/:testId/content", authMiddleware(), testController.getTestContent);

// Teacher routes
router.post(
  "/",
  authMiddleware(["teacher"]),
  uploadFile,
  testController.createTest
);
router.get(
  "/teacher",
  authMiddleware(["teacher"]),
  testController.getTeacherTests
);
router.get(
  "/available-students",
  authMiddleware(["teacher"]),
  testController.getAvailableStudents
);
router.get(
  "/:testId/submissions",
  authMiddleware(["teacher"]),
  testController.getTestSubmissions
);
router.post(
  "/submissions/:submissionId/grade",
  authMiddleware(["teacher"]),
  testController.gradeSubmission
);
router.delete(
  "/:testId",
  authMiddleware(["teacher"]),
  testController.deleteTest
);
router.delete(
  "/submissions/:submissionId",
  authMiddleware(["teacher"]),
  testController.deleteSubmission
);
router.post(
  "/:testId/reset-compromise/:studentId",
  authMiddleware(["teacher"]),
  testController.resetCompromisedTest
);

// Student routes
router.get(
  "/available",
  authMiddleware(["student"]),
  testController.getAvailable || testController.getStudentTests
);
router.post(
  "/submit",
  authMiddleware(["student"]),
  uploadFile,
  testController.submitTest
);

module.exports = router;
