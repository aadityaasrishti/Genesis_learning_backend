const express = require("express");
const router = express.Router();
const { prisma } = require("../config/prisma");
const { authMiddleware } = require("../middleware/authMiddleware");
const cleanupNotifications = require("../scripts/cleanupNotifications");

// Check role middleware
const checkRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "Access denied" });
    }
    next();
  };
};

// Schedule cleanup to run daily at midnight
setInterval(async () => {
  const now = new Date();
  if (now.getHours() === 0 && now.getMinutes() === 0) {
    console.log("Running scheduled notification cleanup...");
    await cleanupNotifications();
  }
}, 60000); // Check every minute

// Get user's notifications with pagination
router.get(
  "/",
  authMiddleware(["admin", "teacher", "student", "support_staff"]),
  async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const type = req.query.type;
      const skip = (page - 1) * limit;

      // Build where clause
      const whereClause = {
        user_id: req.user.user_id,
      };

      // Add type filter if specified
      if (type && type !== "all") {
        // Handle grouped notification types
        if (type === "assignment") {
          whereClause.type = {
            in: [
              "assignment",
              "assignment_created",
              "assignment_submission",
              "submission_confirmation",
              "assignment_graded",
              "assignment_overdue",
              "assignment_update"
            ],
          };
        } else if (type === "teacher_task") {
          whereClause.type = {
            in: ["teacher_task", "task_update"],
          };
        } else if (type === "student_request") {
          whereClause.type = {
            in: ["student_request", "student_request_update"],
          };
        } else {
          whereClause.type = type;
        }
      }

      // Get total count for pagination
      const total = await prisma.notification.count({
        where: whereClause,
      });

      // Get paginated notifications
      const notifications = await prisma.notification.findMany({
        where: whereClause,
        orderBy: {
          created_at: "desc",
        },
        skip,
        take: limit,
      });

      res.json({
        notifications,
        pagination: {
          total,
          pages: Math.ceil(total / limit),
          currentPage: page,
          perPage: limit,
        },
      });
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  }
);

// Create system notification (admin and support staff only)
router.post(
  "/system",
  authMiddleware(["admin", "teacher", "student", "support_staff"]),
  checkRole("admin", "support_staff"),
  async (req, res) => {
    try {
      const { message, targetUsers } = req.body;

      if (!message) {
        return res.status(400).json({ error: "Message is required" });
      }

      let userIds = [];

      // If specific target users are provided, use those
      if (targetUsers && targetUsers.length > 0) {
        userIds = targetUsers;
      } else {
        // Otherwise, send to all active users
        const users = await prisma.user.findMany({
          where: { is_active: true },
          select: { user_id: true },
        });
        userIds = users.map((u) => u.user_id);
      }

      // Create notifications
      await prisma.notification.createMany({
        data: userIds.map((userId) => ({
          user_id: userId,
          message,
          type: "system",
        })),
      });

      res.json({
        success: true,
        message: "System notifications created successfully",
        recipientCount: userIds.length,
      });
    } catch (error) {
      console.error("Error creating system notifications:", error);
      res.status(500).json({ error: "Failed to create system notifications" });
    }
  }
);

// Mark notification as read
router.post(
  "/:id/read",
  authMiddleware(["admin", "teacher", "student", "support_staff"]),
  async (req, res) => {
    try {
      const { id } = req.params;
      const notification = await prisma.notification.update({
        where: {
          id: parseInt(id),
          user_id: req.user.user_id,
        },
        data: {
          is_read: true,
        },
      });
      res.json(notification);
    } catch (error) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({ error: "Failed to mark notification as read" });
    }
  }
);

// Mark all notifications as read
router.post(
  "/mark-all-read",
  authMiddleware(["admin", "teacher", "student", "support_staff"]),
  async (req, res) => {
    try {
      await prisma.notification.updateMany({
        where: {
          user_id: req.user.user_id,
          is_read: false,
        },
        data: {
          is_read: true,
        },
      });

      res.json({ success: true, message: "All notifications marked as read" });
    } catch (error) {
      console.error("Error marking all notifications as read:", error);
      res.status(500).json({ error: "Failed to mark notifications as read" });
    }
  }
);

// Create notification for class updates
router.post(
  "/notify-class",
  authMiddleware(["admin", "teacher", "student", "support_staff"]),
  async (req, res) => {
    try {
      const { class_id, message, type } = req.body;

      // Get all students and teachers in the class
      const students = await prisma.student.findMany({
        where: { class_id },
        select: { user_id: true },
      });

      const teachers = await prisma.teacher.findMany({
        where: {
          class_assigned: {
            contains: class_id,
          },
        },
        select: { user_id: true },
      });

      // Create notifications for all relevant users
      const userIds = [...students, ...teachers].map((u) => u.user_id);

      await prisma.notification.createMany({
        data: userIds.map((user_id) => ({
          user_id,
          message,
          type,
        })),
      });

      res.json({
        success: true,
        message: "Notifications created successfully",
      });
    } catch (error) {
      console.error("Error creating notifications:", error);
      res.status(500).json({ error: "Failed to create notifications" });
    }
  }
);

// Delete read notifications older than 30 days
router.delete(
  "/cleanup",
  authMiddleware(["admin", "teacher", "student", "support_staff"]),
  async (req, res) => {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      await prisma.notification.deleteMany({
        where: {
          user_id: req.user.user_id,
          is_read: true,
          created_at: {
            lt: thirtyDaysAgo,
          },
        },
      });

      res.json({ success: true, message: "Old notifications cleaned up" });
    } catch (error) {
      console.error("Error cleaning up notifications:", error);
      res.status(500).json({ error: "Failed to clean up notifications" });
    }
  }
);

// Batch cleanup notifications
router.delete(
  "/cleanup/batch",
  authMiddleware(["admin", "teacher", "student", "support_staff"]),
  async (req, res) => {
    try {
      const { olderThan, status } = req.query;
      const daysAgo = parseInt(olderThan) || 30;
      const date = new Date();
      date.setDate(date.getDate() - daysAgo);

      const whereClause = {
        user_id: req.user.user_id,
        created_at: {
          lt: date,
        },
      };

      if (status === "read") {
        whereClause.is_read = true;
      }

      const result = await prisma.notification.deleteMany({
        where: whereClause,
      });

      res.json({
        success: true,
        message: "Notifications cleaned up successfully",
        count: result.count,
      });
    } catch (error) {
      console.error("Error cleaning up notifications:", error);
      res.status(500).json({
        success: false,
        error: "Failed to clean up notifications",
        count: 0,
      });
    }
  }
);

// Delete a specific notification
router.delete(
  "/:id",
  authMiddleware(["admin", "teacher", "student", "support_staff"]),
  async (req, res) => {
    try {
      const { id } = req.params;
      const notification = await prisma.notification.findUnique({
        where: { id: parseInt(id) },
      });

      if (!notification) {
        return res.status(404).json({ error: "Notification not found" });
      }

      if (notification.user_id !== req.user.user_id) {
        return res
          .status(403)
          .json({ error: "Not authorized to delete this notification" });
      }

      await prisma.notification.delete({
        where: { id: parseInt(id) },
      });

      res.json({ success: true, message: "Notification deleted successfully" });
    } catch (error) {
      console.error("Error deleting notification:", error);
      res.status(500).json({ error: "Failed to delete notification" });
    }
  }
);

module.exports = router;
