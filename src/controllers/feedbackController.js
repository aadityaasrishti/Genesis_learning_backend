const { prisma } = require("../config/prisma");
const {
  PrismaClientKnownRequestError,
} = require("@prisma/client/runtime/library");

const createFeedback = async (req, res) => {
  const startTime = Date.now();
  try {
    const { to_id, message, rating } = req.body;
    const from_id = req.user.user_id;

    // Quick validation
    if (!to_id || !message) {
      return res.status(400).json({
        error: "Missing required fields",
        details: {
          to_id: !to_id ? "Recipient ID is required" : null,
          message: !message ? "Feedback message is required" : null,
        },
      });
    }

    // First check if recipient exists - this is faster than a transaction
    const recipient = await prisma.user.findUnique({
      where: { user_id: to_id },
      select: { user_id: true, is_active: true },
    });

    if (!recipient || !recipient.is_active) {
      return res
        .status(404)
        .json({ error: "Recipient not found or is inactive" });
    }

    // Create feedback without transaction since we've already validated
    const feedback = await prisma.feedback.create({
      data: {
        from_id,
        to_id,
        message,
        rating: rating || 0,
      },
      select: {
        id: true,
        message: true,
        rating: true,
        created_at: true,
        from_id: true,
        to_id: true,
        from_user: {
          select: { name: true, role: true },
        },
        to_user: {
          select: { name: true, role: true },
        },
      },
    });

    // Create notification for the recipient
    await prisma.notification.create({
      data: {
        user_id: to_id,
        message: `New feedback received from ${feedback.from_user.name}`,
        type: "feedback",
      },
    });

    // If feedback is from a student, notify admins and support staff
    if (feedback.from_user.role === "student") {
      const adminStaff = await prisma.user.findMany({
        where: {
          OR: [{ role: "admin" }, { role: "support_staff" }],
          is_active: true,
        },
        select: {
          user_id: true,
        },
      });

      if (adminStaff.length > 0) {
        await prisma.notification.createMany({
          data: adminStaff.map((staff) => ({
            user_id: staff.user_id,
            message: `New feedback submitted from ${feedback.from_user.name} (${feedback.from_user.role}) to ${feedback.to_user.name} (${feedback.to_user.role})`,
            type: "feedback",
          })),
        });
      }
    }

    const duration = Date.now() - startTime;
    console.log(`Feedback creation took ${duration}ms`);

    // If the operation took too long, log it for monitoring
    if (duration > 2000) {
      console.warn(`Slow feedback creation detected: ${duration}ms`);
    }

    res.status(201).json(feedback);
  } catch (error) {
    console.error("Error in createFeedback:", error);
    console.error(`Error occurred after ${Date.now() - startTime}ms`);

    res.status(500).json({
      error: "Failed to create feedback",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

const getFeedbackCount = async (req, res) => {
  try {
    const { role } = req.user;
    const { filterType, startDate, endDate } = req.query;

    let whereClause = { is_deleted: false };

    if (role !== "admin" && role !== "support_staff") {
      whereClause.OR = [
        { from_id: req.user.user_id },
        { to_id: req.user.user_id },
      ];
    } else if (filterType) {
      whereClause.from_user = {
        role: filterType === "student" ? "student" : "teacher",
      };
    }

    if (startDate && endDate) {
      whereClause.created_at = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    }

    const total = await prisma.feedback.count({ where: whereClause });
    res.json({ total });
  } catch (error) {
    console.error("Error in getFeedbackCount:", error);
    res.status(500).json({
      error: "Failed to get feedback count",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

const getFeedbacks = async (req, res) => {
  try {
    const { role } = req.user;
    const { filterType, page = 1, limit = 20, startDate, endDate } = req.query;
    const pageSize = Math.min(parseInt(limit), 50);
    const skip = (parseInt(page) - 1) * pageSize;

    let whereClause = { is_deleted: false };

    if (role !== "admin" && role !== "support_staff") {
      whereClause.OR = [
        { from_id: req.user.user_id },
        { to_id: req.user.user_id },
      ];
    } else if (filterType) {
      whereClause.from_user = {
        role: filterType === "student" ? "student" : "teacher",
      };
    }

    if (startDate && endDate) {
      whereClause.created_at = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    }

    // Execute only data query since count is handled separately
    const feedbacks = await prisma.feedback
      .findMany({
        where: whereClause,
        select: {
          id: true,
          message: true,
          rating: true,
          created_at: true,
          from_id: true,
          to_id: true,
          from_user: {
            select: { name: true, role: true },
          },
          to_user: {
            select: { name: true, role: true },
          },
        },
        orderBy: { created_at: "desc" },
        take: pageSize,
        skip,
      })
      .catch((error) => {
        console.error("Database query error:", error);
        throw new Error("Failed to fetch feedbacks from database");
      });

    // Even if no feedbacks are found, return an empty array
    res.json({ feedbacks: feedbacks || [] });
  } catch (error) {
    console.error("Error in getFeedbacks:", error);
    res.status(500).json({
      error: "Failed to fetch feedbacks",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

const deleteFeedback = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.user;

    const feedback = await prisma.feedback.findUnique({
      where: { id: parseInt(id) },
      select: {
        id: true,
        from_id: true,
      },
    });

    if (!feedback) {
      return res.status(404).json({ error: "Feedback not found" });
    }

    if (
      role !== "admin" &&
      role !== "support_staff" &&
      feedback.from_id !== req.user.user_id
    ) {
      return res
        .status(403)
        .json({ error: "Unauthorized to delete this feedback" });
    }

    await prisma.feedback.update({
      where: { id: parseInt(id) },
      data: { is_deleted: true },
    });

    res.json({ message: "Feedback deleted successfully" });
  } catch (error) {
    console.error("Error in deleteFeedback:", error);
    res.status(500).json({
      error: "Failed to delete feedback",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

module.exports = {
  createFeedback,
  getFeedbacks,
  deleteFeedback,
  getFeedbackCount,
};
