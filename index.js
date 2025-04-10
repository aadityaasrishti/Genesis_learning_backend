require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const https = require("https");
const http = require("http");
const crypto = require("crypto");
const { prisma } = require("./src/config/prisma");
const authRoutes = require("./src/routes/auth");
const attendanceRoutes = require("./src/routes/attendance");
const extraClassRoutes = require("./src/routes/extraClass");
const notificationRoutes = require("./src/routes/notifications");
const tasksRouter = require("./src/routes/tasks");
const feedbackRoutes = require("./src/routes/feedback");
const calendarRoutes = require("./src/routes/calendar");
const holidayRoutes = require("./src/routes/holidays");
const assignmentRoutes = require("./src/routes/assignments");
const examNotificationRoutes = require("./src/routes/examNotifications");
const feeRoutes = require("./src/routes/fees");
const salaryRoutes = require("./src/routes/salary");
const testRoutes = require("./src/routes/tests");
const notesRoutes = require("./src/routes/notes");
const mcqRoutes = require("./src/routes/mcq");
const studentReportRoutes = require("./src/routes/studentReports");
const examResultsRoutes = require("./src/routes/examResults");
const scheduleRoutes = require("./src/routes/schedules");
const dailyChallengeRoutes = require("./src/routes/dailyChallenge");
const cron = require("node-cron");
const sendAssignmentReminders = require("./src/scripts/assignmentReminders");
const sendFeeReminders = require("./src/scripts/feeReminders");
const cleanupFiles = require("./src/scripts/cleanupFiles");
const checkDemoUsers = require("./src/scripts/demoUserCheck");
const checkInactiveUsers = require("./src/scripts/inactivityCheck");
const initializeUploadDirectories = require("./src/scripts/initDirs");
const { scheduleFeeReminders } = require("./src/scripts/feeReminders");
const profileRoutes = require("./src/routes/profile");

const app = express();

// Initialize app
const initialize = async () => {
  // Initialize upload directories
  initializeUploadDirectories();

  // Initialize database connection
  try {
    await prisma.$connect();
    console.log("Database connection established successfully");
  } catch (error) {
    console.error("Failed to connect to database:", error);
    process.exit(1);
  }
};

// Accept JSON and URL-encoded data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS configuration with specific timeout settings
const corsOptions = {
  origin: JSON.parse(process.env.CORS_ORIGINS || '["https://localhost:5173"]'),
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
  allowedHeaders: [
    "Content-Type", 
    "Authorization", 
    "Range", 
    "Accept", 
    "Accept-Ranges",
    "Content-Range",
    "Content-Length"
  ],
  credentials: true,
  maxAge: 86400 // 24 hours
};

app.use(cors(corsOptions));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/extra-class", extraClassRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/taskRoutes", tasksRouter);
app.use("/api/feedback", feedbackRoutes);
app.use("/api/calendar", calendarRoutes);
app.use("/api/holidays", holidayRoutes);
app.use("/api/assignments", assignmentRoutes);
app.use("/api/exam-notifications", examNotificationRoutes);
app.use("/api/fees", feeRoutes);
app.use("/api/salary", salaryRoutes);
app.use("/api/tests", testRoutes);
app.use("/api/notes", notesRoutes);
app.use("/api/mcq", mcqRoutes);
app.use("/api/student-reports", studentReportRoutes);
app.use("/api/exam-results", examResultsRoutes);
app.use("/api/schedules", scheduleRoutes);
app.use("/api/expenses", require("./src/routes/expenses")); // Add expenses route
app.use("/api/daily-challenges", dailyChallengeRoutes);

// Serve static files from uploads directory with proper headers
app.use(
  "/api/uploads",
  express.static(path.join(__dirname, "uploads"), {
    setHeaders: (res, filePath) => {
      // Set CORS headers
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Range");
      res.setHeader("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Length");
      
      // Set cache control headers
      res.setHeader("Cache-Control", "public, max-age=31536000");
      
      // Set security headers
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
      res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
      res.setHeader("X-Content-Type-Options", "nosniff");
      
      // Set proper content type for different file types
      if (filePath.endsWith(".pdf")) {
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", "inline");
        res.setHeader("Content-Security-Policy", "default-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data:");
      } else if (filePath.match(/\.(jpg|jpeg)$/i)) {
        res.setHeader("Content-Type", "image/jpeg");
      } else if (filePath.match(/\.png$/i)) {
        res.setHeader("Content-Type", "image/png");
      } else if (filePath.match(/\.svg$/i)) {
        res.setHeader("Content-Type", "image/svg+xml");
      } else if (filePath.match(/\.gif$/i)) {
        res.setHeader("Content-Type", "image/gif");
      } else if (filePath.match(/\.mp4$/i)) {
        res.setHeader("Content-Type", "video/mp4");
      } else if (filePath.match(/\.webm$/i)) {
        res.setHeader("Content-Type", "video/webm");
      }
    },
  })
);

// Configure static file serving for uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  setHeaders: (res, filePath) => {
    // Enable CORS for images
    res.setHeader('Access-Control-Allow-Origin', '*');
    // Set proper cache control
    res.setHeader('Cache-Control', 'public, max-age=3600');
    // Set content type for images
    if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) {
      res.setHeader('Content-Type', 'image/jpeg');
    } else if (filePath.endsWith('.png')) {
      res.setHeader('Content-Type', 'image/png');
    }
  }
}));

// URL rewrite middleware for handling malformed upload URLs
app.use((req, res, next) => {
  if (req.url.startsWith("/apiuploads/")) {
    req.url = "/api/uploads/" + req.url.slice(11);
  }
  next();
});

// Static file serving comes after protected routes
app.use(
  "/api/uploads",
  express.static(path.join(__dirname, "uploads"), {
    setHeaders: (res, filePath) => {
      // Set appropriate Content-Type and security headers for PDFs
      if (filePath.endsWith(".pdf")) {
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", "inline");
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.removeHeader("X-Frame-Options"); // Remove frame restriction
        res.setHeader("Content-Security-Policy", "default-src 'self' blob: data:; object-src 'self' blob: data:; frame-ancestors 'self' *");
      } else if (filePath.endsWith(".mp4")) {
        res.setHeader("Content-Type", "video/mp4");
      } else if (filePath.endsWith(".webm")) {
        res.setHeader("Content-Type", "video/webm");
      } else if (filePath.endsWith(".docx")) {
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        res.setHeader("Content-Disposition", "attachment");
      }

      // Set Cross-Origin headers for all content
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Range");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
      res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
      
      // Cache control for better performance
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.setHeader("Accept-Ranges", "bytes");
    },
    fallthrough: true,
  })
);

// Detailed 404 handler for static files
app.use((req, res, next) => {
  if (
    req.url.startsWith("/api/uploads/") ||
    req.url.startsWith("/apiuploads/")
  ) {
    console.error("File not found:", {
      url: req.url,
      method: req.method,
      originalUrl: req.originalUrl,
      path: req.path,
    });
    return res.status(404).json({
      error: "File not found",
      path: req.url,
      message: "The requested file does not exist",
    });
  }
  next();
});

// Schedule assignment reminders
cron.schedule("0 9 * * *", () => {
  console.log("Running assignment reminders check...");
  sendAssignmentReminders();
});

// Schedule fee reminders to run every day at 10 AM
cron.schedule("0 10 * * *", () => {
  console.log("Running fee reminders check...");
  sendFeeReminders();
});

// Schedule cleanup to run every day at midnight
cron.schedule("0 0 * * *", () => {
  console.log("Running file cleanup...");
  cleanupFiles();
});

// Schedule demo user check to run every day at 1 AM
cron.schedule("0 1 * * *", () => {
  console.log("Running demo user check...");
  checkDemoUsers();
});

// Schedule inactive user check to run every day at 2 AM
cron.schedule("0 2 * * *", () => {
  console.log("Running inactive user check...");
  checkInactiveUsers();
});

// Initialize scheduled tasks
scheduleFeeReminders();

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Error details:", {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  if (err.name === "TimeoutError" || err.code === "ETIMEDOUT") {
    return res.status(408).json({
      error:
        "Request timeout. The server is experiencing high load. Please try again.",
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }

  if (
    err.name === "PrismaClientInitializationError" ||
    err.name === "PrismaClientKnownRequestError"
  ) {
    return res.status(503).json({
      error: "Database connection error. Please try again later.",
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }

  res.status(err.status || 500).json({
    error: err.message || "Something went wrong!",
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });
});

// Handle 404 routes with detailed logging
app.use((req, res) => {
  console.log("404 Not Found:", {
    method: req.method,
    url: req.url,
    headers: req.headers,
    query: req.query,
    body: req.body,
  });
  res.status(404).json({
    error: "Route not found",
    path: req.url,
    method: req.method,
  });
});

// Start server after initialization
initialize()
  .then(() => {
    const PORT = process.env.PORT || 5000;
    const HTTP_PORT = process.env.HTTP_PORT || 8080;

    try {
      // Read SSL certificates
      const privateKey = fs.readFileSync(
        path.join(__dirname, process.env.SSL_KEY_PATH),
        "utf8"
      );
      const certificate = fs.readFileSync(
        path.join(__dirname, process.env.SSL_CERT_PATH),
        "utf8"
      );

      const credentials = {
        key: privateKey,
        cert: certificate,
        secureOptions: crypto.constants.SSL_OP_NO_TLSv1 | crypto.constants.SSL_OP_NO_TLSv1_1
      };

      // Create HTTPS server
      const httpsServer = https.createServer(credentials, app);

      // Create HTTP server that redirects to HTTPS
      const httpServer = http.createServer((req, res) => {
        const hostname = req.headers.host?.split(':')[0] || 'localhost';
        const httpsUrl = `https://${hostname}:${PORT}${req.url}`;
        res.writeHead(301, { Location: httpsUrl });
        res.end();
      });

      // Listen on specific network interfaces
      httpServer.listen(HTTP_PORT, "0.0.0.0", () => {
        console.log(`HTTP Server running on port ${HTTP_PORT} (redirecting to HTTPS)`);
      });

      httpsServer.listen(PORT, "0.0.0.0", () => {
        console.log(`HTTPS Server running on port ${PORT}`);
        console.log('Server accessible at:');
        console.log(`- https://localhost:${PORT}`);
        console.log(`- https://127.0.0.1:${PORT}`);
        if (process.env.NODE_ENV === 'development') {
          console.log(`- https://192.168.0.120:${PORT}`);
        }
      });

    } catch (error) {
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('Failed to initialize:', error);
    process.exit(1);
  });
