const express = require("express");
const router = express.Router();
const salaryController = require("../controllers/salaryController");
const { authMiddleware } = require("../middleware/authMiddleware");
const { prisma } = require("../config/prisma");

// Get all teachers for salary management
router.get(
  "/teachers",
  authMiddleware(["admin"]),
  async (req, res) => {
    try {
      const teachers = await prisma.user.findMany({
        where: {
          role: "teacher",
          is_active: true,
        },
        include: {
          teacher: {
            select: {
              subject: true,
              class_assigned: true,
            },
          },
        },
        orderBy: {
          name: "asc",
        },
      });

      console.log("[Salary][Teachers] Found teachers:", {
        count: teachers.length,
        teacherDetails: teachers.map(t => ({
          id: t.user_id,
          name: t.name,
          hasTeacherRecord: !!t.teacher,
          rawClassAssigned: t.teacher?.class_assigned
        }))
      });

      const formattedTeachers = teachers.map((teacher) => {
        const formatted = {
          user_id: teacher.user_id,
          name: teacher.name,
          subject: teacher.teacher?.subject || "",
          class_assigned: teacher.teacher?.class_assigned || ""
        };

        console.log("[Salary][Teachers] Formatted teacher:", {
          id: formatted.user_id,
          name: formatted.name,
          hasSubject: !!formatted.subject,
          hasClassAssigned: !!formatted.class_assigned,
          rawClassAssigned: formatted.class_assigned
        });

        return formatted;
      });

      console.log("[Salary][Teachers] Response:", {
        totalTeachers: formattedTeachers.length,
        teachersWithClasses: formattedTeachers.filter(t => t.class_assigned).length
      });

      res.json(formattedTeachers);
    } catch (error) {
      console.error("[Salary][Teachers] Error fetching teachers:", {
        error: error.message,
        stack: error.stack
      });
      res.status(500).json({ 
        error: "Failed to fetch teachers",
        details: error.message
      });
    }
  }
);

// Route to set or update teacher salary configuration
router.post(
  "/teacher/config",
  authMiddleware(["admin"]),
  salaryController.setTeacherSalary
);

// Route to calculate commission-based salary
router.post(
  "/teacher/calculate-commission",
  authMiddleware(["admin", "teacher"]),
  salaryController.calculateCommissionSalary
);

// Route to process salary payment
router.post(
  "/teacher/payment",
  authMiddleware(["admin"]),
  salaryController.processSalaryPayment
);

// Route to get salary history for a teacher
router.get(
  "/teacher/:teacher_id/history",
  authMiddleware(["admin", "teacher"]),
  salaryController.getTeacherSalaryHistory
);

// Route to get current salary configuration
router.get(
  "/teacher/:teacher_id/config",
  authMiddleware(["admin", "teacher"]),
  salaryController.getCurrentSalaryConfig
);

module.exports = router;
