const express = require("express");
const router = express.Router();
const { prisma } = require("../config/prisma");
const { authMiddleware } = require("../middleware/authMiddleware");
const { checkRole } = require("../middleware/roleMiddleware");

// Get schedules for a class
router.get(
  "/class/:classId",
  authMiddleware(["admin", "teacher", "student", "support_staff"]),
  async (req, res) => {
    try {
      const { classId } = req.params;

      const schedules = await prisma.classSchedule.findMany({
        where: {
          class_id: classId,
          is_active: true,
        },
        include: {
          teacher: {
            select: {
              name: true,
            },
          },
        },
        orderBy: [{ day_of_week: "asc" }, { start_time: "asc" }],
      });

      res.json(schedules);
    } catch (error) {
      console.error("Error fetching class schedules:", error);
      res.status(500).json({ error: "Failed to fetch class schedules" });
    }
  }
);

// Get schedules for a teacher
router.get(
  "/teacher/:teacherId",
  authMiddleware(["admin", "teacher", "support_staff"]),
  async (req, res) => {
    try {
      const { teacherId } = req.params;

      const schedules = await prisma.classSchedule.findMany({
        where: {
          teacher_id: parseInt(teacherId),
          is_active: true,
        },
        orderBy: [{ day_of_week: "asc" }, { start_time: "asc" }],
      });

      res.json(schedules);
    } catch (error) {
      console.error("Error fetching teacher schedules:", error);
      res.status(500).json({ error: "Failed to fetch teacher schedules" });
    }
  }
);

// Create a new schedule
router.post(
  "/",
  authMiddleware(["admin", "support_staff"]),
  checkRole("admin", "support_staff"),
  async (req, res) => {
    try {
      const {
        class_id,
        subject,
        teacher_id,
        day_of_week,
        start_time,
        end_time,
        room,
      } = req.body;

      // Validate required fields
      if (
        !class_id ||
        !subject ||
        !teacher_id ||
        day_of_week === undefined ||
        !start_time ||
        !end_time
      ) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Validate day_of_week
      if (day_of_week < 0 || day_of_week > 6) {
        return res.status(400).json({ error: "Invalid day of week" });
      }

      // Check for schedule conflicts
      const conflicts = await prisma.classSchedule.findFirst({
        where: {
          is_active: true,
          day_of_week: day_of_week,
          OR: [
            {
              AND: [
                { start_time: { lte: start_time } },
                { end_time: { gt: start_time } },
              ],
            },
            {
              AND: [
                { start_time: { lt: end_time } },
                { end_time: { gte: end_time } },
              ],
            },
          ],
          OR: [{ class_id: class_id }, { teacher_id: parseInt(teacher_id) }],
        },
      });

      if (conflicts) {
        return res.status(409).json({ error: "Schedule conflict detected" });
      }

      const schedule = await prisma.classSchedule.create({
        data: {
          class_id,
          subject,
          teacher_id: parseInt(teacher_id),
          day_of_week,
          start_time,
          end_time,
          room,
        },
      });

      res.status(201).json(schedule);
    } catch (error) {
      console.error("Error creating schedule:", error);
      res.status(500).json({ error: "Failed to create schedule" });
    }
  }
);

// Update a schedule
router.put(
  "/:id",
  authMiddleware(["admin", "support_staff"]),
  checkRole("admin", "support_staff"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const {
        class_id,
        subject,
        teacher_id,
        day_of_week,
        start_time,
        end_time,
        room,
        is_active,
      } = req.body;

      const schedule = await prisma.classSchedule.update({
        where: { id: parseInt(id) },
        data: {
          class_id,
          subject,
          teacher_id: parseInt(teacher_id),
          day_of_week,
          start_time,
          end_time,
          room,
          is_active,
        },
      });

      res.json(schedule);
    } catch (error) {
      console.error("Error updating schedule:", error);
      res.status(500).json({ error: "Failed to update schedule" });
    }
  }
);

// Delete a schedule (soft delete)
router.delete(
  "/:id",
  authMiddleware(["admin", "support_staff"]),
  checkRole("admin", "support_staff"),
  async (req, res) => {
    try {
      const { id } = req.params;

      await prisma.classSchedule.update({
        where: { id: parseInt(id) },
        data: { is_active: false },
      });

      res.json({ message: "Schedule deleted successfully" });
    } catch (error) {
      console.error("Error deleting schedule:", error);
      res.status(500).json({ error: "Failed to delete schedule" });
    }
  }
);

module.exports = router;
