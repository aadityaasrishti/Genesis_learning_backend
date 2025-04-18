require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
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
const checkDemoUsers = require("./src/scripts/demoUserCheck");
const checkInactiveUsers = require("./src/scripts/inactivityCheck");
const { scheduleFeeReminders } = require("./src/scripts/feeReminders");
const profileRoutes = require("./src/routes/profile");

const app = express();

// Initialize app
const initialize = async () => {
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
  origin: JSON.parse(process.env.CORS_ORIGINS || '["http://localhost:5173"]'),
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "Range",
    "Accept",
    "Accept-Ranges",
    "Content-Range",
    "Content-Length",
  ],
  credentials: true,
  maxAge: 86400, // 24 hours
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

// All file serving is now handled through Supabase storage URLs

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

// File cleanup is now handled automatically by Supabase Storage lifecycle policies

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

    // Create HTTP server - SSL will be handled by the hosting platform
    app.listen(PORT, () => {
      if (process.env.NODE_ENV === "development") {
        console.log(`Server running on http://localhost:${PORT}`);
        console.log(`Server accessible at http://127.0.0.1:${PORT}`);
      } else {
        console.log(
          `Server is live at: ${
            process.env.RAILWAY_STATIC_URL || "your-production-URL"
          }`
        );
      }
    });
  })
  .catch((error) => {
    console.error("Failed to initialize:", error);
    process.exit(1);
  });
