const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

// Ensure uploads directory exists
const UPLOADS_DIR =
  process.env.UPLOAD_BASE_PATH || path.join(__dirname, "../../uploads");
const TESTS_DIR = path.join(UPLOADS_DIR, "tests");
const SUBMISSIONS_DIR = path.join(UPLOADS_DIR, "submissions");

[UPLOADS_DIR, TESTS_DIR, SUBMISSIONS_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Generate unique filename
const generateUniqueFilename = (originalname) => {
  const timestamp = Date.now();
  const random = crypto.randomBytes(8).toString("hex");
  const ext = path.extname(originalname);
  return `${timestamp}-${random}${ext}`;
};

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Determine the appropriate upload directory based on the route
    let uploadDir = UPLOADS_DIR;
    if (req.path.includes("test")) {
      uploadDir = req.path.includes("submit") ? SUBMISSIONS_DIR : TESTS_DIR;
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, generateUniqueFilename(file.originalname));
  },
});

// File filter
const fileFilter = (req, file, cb) => {
  // Allow PDF files by default
  if (file.mimetype === "application/pdf") {
    cb(null, true);
  } else {
    cb(new Error("Only PDF files are allowed"), false);
  }
};

// Create multer upload instance
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: parseInt(process.env.FILE_UPLOAD_LIMIT_TEST) || 52428800, // Default to 50MB if not set
  },
});

// Export middleware
exports.uploadFile = upload.single("file");
