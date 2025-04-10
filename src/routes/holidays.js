const express = require("express");
const router = express.Router();
const { prisma } = require("../config/prisma");
const { authMiddleware } = require("../middleware/authMiddleware");

// Get all holidays - accessible to all authenticated users
router.get("/", authMiddleware(["admin", "teacher", "student", "support_staff"]), async (req, res) => {
  try {
    const holidays = await prisma.holiday.findMany({
      orderBy: { date: "asc" },
    });
    res.json(holidays);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch holidays" });
  }
});

// Add new holiday - admin only
router.post("/", authMiddleware(["admin"]), async (req, res) => {
  try {
    const { date, name, description, type } = req.body;
    const holiday = await prisma.holiday.create({
      data: {
        date: new Date(date),
        name,
        description,
        type,
        color: type === "HOLIDAY" ? "#ff4444" : "#4CAF50",
      },
    });
    res.status(201).json(holiday);
  } catch (error) {
    res.status(500).json({ error: "Failed to create holiday" });
  }
});

// Delete holiday - admin only
router.delete("/:id", authMiddleware(["admin"]), async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.holiday.delete({
      where: { id: parseInt(id) },
    });
    res.json({ message: "Holiday deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete holiday" });
  }
});

module.exports = router;
