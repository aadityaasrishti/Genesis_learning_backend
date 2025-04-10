const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/authMiddleware");
const { prisma } = require("../config/prisma");
const { sendFeeReminder, generateFeeReceipt } = require("../utils/feeUtils");
const {
  createFeeStructure,
  processFeePayment,
  getStudentFeeDetails,
  getFeeReports,
} = require("../controllers/feeController");

// Fee Structure Management (Admin only)
router.post(
  "/structure",
  authMiddleware(["admin", "support_staff"]),
  createFeeStructure
);

router.get(
  "/structures",
  authMiddleware(["admin", "teacher", "support_staff"]),
  async (req, res) => {
    const startTime = Date.now();
    const { class_id } = req.query;
    console.log("[FeeRoutes] Getting fee structures:", { class_id });

    try {
      const structures = await prisma.feeStructure.findMany({
        where: {
          ...(class_id && { class_id }),
          OR: [
            {
              valid_until: {
                gte: new Date(),
              },
            },
            {
              valid_until: null,
            },
          ],
        },
        orderBy: [
          { class_id: 'asc' },
          { valid_from: 'desc' }
        ],
        include: {
          students: {
            select: {
              user_id: true,
              class_id: true,
            }
          }
        }
      });

      console.log("[FeeRoutes] Retrieved fee structures:", {
        count: structures.length,
        classIds: structures.map(s => s.class_id),
        duration: Date.now() - startTime
      });

      res.json(structures);
    } catch (error) {
      console.error("[FeeRoutes] Error fetching fee structures:", {
        error: error.message,
        stack: error.stack,
        query: req.query,
        duration: Date.now() - startTime
      });
      res.status(500).json({ error: "Failed to fetch fee structures" });
    }
  }
);

// Get all payments (Admin and support staff only)
router.get(
  "/payments",
  authMiddleware(["admin", "support_staff"]),
  async (req, res) => {
    const startTime = Date.now();
    console.log("[FeeRoutes] Getting all payments");

    try {
      const payments = await prisma.feePayment.findMany({
        include: {
          student: {
            include: {
              user: true,
            },
          },
          fee_structure: true,
        },
        orderBy: { payment_date: "desc" },
      });

      console.log("[FeeRoutes] Retrieved payments:", {
        count: payments.length,
        duration: Date.now() - startTime
      });

      res.json(payments);
    } catch (error) {
      console.error("[FeeRoutes] Error fetching payments:", {
        error: error.message,
        stack: error.stack,
        duration: Date.now() - startTime
      });
      res.status(500).json({ error: "Failed to fetch payments" });
    }
  }
);

// Get student payments grouped by month
router.get(
  "/payments-by-month",
  authMiddleware(["admin", "teacher", "support_staff"]),
  async (req, res) => {
    const startTime = Date.now();
    const { class_id } = req.query;
    console.log("[FeeRoutes] Getting payments by month:", { class_id });

    try {
      const students = await prisma.student.findMany({
        where: {
          ...(class_id && { class_id }),
          user: {
            is_active: true,
          },
        },
        include: {
          user: {
            select: {
              name: true,
            },
          },
          fee_payments: {
            select: {
              payment_status: true,
              month: true,
            },
            orderBy: {
              month: "desc",
            },
          },
        },
        orderBy: {
          user: {
            name: "asc",
          },
        },
      });

      console.log("[FeeRoutes] Retrieved monthly payments:", {
        studentCount: students.length,
        class_id,
        duration: Date.now() - startTime
      });

      res.json(students);
    } catch (error) {
      console.error("[FeeRoutes] Error fetching monthly payments:", {
        error: error.message,
        stack: error.stack,
        class_id,
        duration: Date.now() - startTime
      });
      res.status(500).json({ error: "Failed to fetch student payments" });
    }
  }
);

// Fee Payment Processing (Admin and support staff)
router.post(
  "/payments", // Changed from /payment to /payments to match frontend
  authMiddleware(["admin", "support_staff"]),
  async (req, res, next) => {
    const startTime = Date.now();
    console.log("[FeeRoutes] Processing new payment:", { 
      userId: req.user.user_id 
    });

    try {
      const user = await prisma.user.findUnique({
        where: { user_id: req.user.user_id },
      });

      if (!user) {
        console.warn("[FeeRoutes] Unauthorized payment attempt:", {
          userId: req.user.user_id,
          duration: Date.now() - startTime
        });
        return res.status(401).json({ error: "Unauthorized" });
      }

      req.user = user;
      console.log("[FeeRoutes] User authorized for payment:", {
        userId: user.user_id,
        role: user.role,
        duration: Date.now() - startTime
      });

      next();
    } catch (error) {
      console.error("[FeeRoutes] Error in payment authorization:", {
        error: error.message,
        stack: error.stack,
        userId: req.user.user_id,
        duration: Date.now() - startTime
      });
      res.status(500).json({ error: "Authorization failed" });
    }
  },
  processFeePayment
);

// Get Student Fee Details (accessible by admin, teacher, student, and support staff)
router.get(
  "/student/:student_id",
  authMiddleware(["admin", "teacher", "student", "support_staff"]),
  async (req, res) => {
    // Students can only view their own fee details
    if (
      req.user.role === "student" &&
      req.user.user_id !== parseInt(req.params.student_id)
    ) {
      console.warn("[FeeRoutes] Unauthorized fee details access attempt:", {
        userId: req.user.user_id,
        requestedStudentId: req.params.student_id
      });
      return res.status(403).json({ error: "Access denied" });
    }

    // Teachers can only view fee details of students in their assigned classes
    if (req.user.role === "teacher") {
      const teacher = await prisma.teacher.findUnique({
        where: { user_id: req.user.user_id },
      });
      const student = await prisma.student.findUnique({
        where: { user_id: parseInt(req.params.student_id) },
      });

      if (!teacher.class_assigned.includes(student.class_id)) {
        console.warn("[FeeRoutes] Teacher unauthorized fee details access:", {
          teacherId: req.user.user_id,
          studentId: req.params.student_id,
          teacherClasses: teacher.class_assigned,
          studentClass: student.class_id
        });
        return res.status(403).json({ error: "Access denied" });
      }
    }

    return getStudentFeeDetails(req, res);
  }
);

// Get Fee Reports (Admin and support staff only)
router.get(
  "/reports",
  authMiddleware(["admin", "support_staff"]),
  getFeeReports
);

// Process refund (Admin only)
router.post(
  "/refund/:payment_id",
  authMiddleware(["admin", "support_staff"]),
  async (req, res) => {
    const startTime = Date.now();
    const { payment_id } = req.params;
    const { amount, reason } = req.body;
    console.log("[FeeRoutes] Processing refund:", { payment_id, amount });

    try {
      const payment = await prisma.feePayment.findUnique({
        where: { id: parseInt(payment_id) },
      });

      if (!payment) {
        console.warn("[FeeRoutes] Payment not found for refund:", { payment_id });
        return res.status(404).json({ error: "Payment not found" });
      }

      // Update payment status and create refund record
      await prisma.$transaction([
        prisma.feePayment.update({
          where: { id: parseInt(payment_id) },
          data: {
            payment_status: "CANCELLED",
            remarks: `Refunded: ${reason}`,
          },
        }),
        prisma.notification.create({
          data: {
            user_id: payment.student_id,
            message: `A refund of ₹${amount} has been processed for receipt ${payment.receipt_number}`,
            type: "fee_refund",
          },
        }),
      ]);

      console.log("[FeeRoutes] Refund processed successfully:", {
        payment_id,
        amount,
        receipt: payment.receipt_number,
        duration: Date.now() - startTime
      });

      res.json({ message: "Refund processed successfully" });
    } catch (error) {
      console.error("[FeeRoutes] Error processing refund:", {
        error: error.message,
        stack: error.stack,
        payment_id,
        amount,
        duration: Date.now() - startTime
      });
      res.status(500).json({ error: "Failed to process refund" });
    }
  }
);

// Send fee reminder
router.post(
  "/remind/:student_id",
  authMiddleware(["admin", "support_staff"]),
  async (req, res) => {
    const startTime = Date.now();
    const { student_id } = req.params;
    const { payment_id, reminder_type } = req.body;
    console.log("[FeeRoutes] Sending fee reminder:", { 
      student_id, 
      payment_id,
      type: reminder_type
    });

    try {
      const success = await sendFeeReminder(
        parseInt(student_id),
        parseInt(payment_id),
        reminder_type
      );

      if (success) {
        console.log("[FeeRoutes] Fee reminder sent successfully:", {
          student_id,
          payment_id,
          duration: Date.now() - startTime
        });
        res.json({ message: "Reminder sent successfully" });
      } else {
        console.warn("[FeeRoutes] Failed to send reminder:", {
          student_id,
          payment_id,
          duration: Date.now() - startTime
        });
        res.status(500).json({ error: "Failed to send reminder" });
      }
    } catch (error) {
      console.error("[FeeRoutes] Error sending reminder:", {
        error: error.message,
        stack: error.stack,
        student_id,
        payment_id,
        duration: Date.now() - startTime
      });
      res.status(500).json({ error: "Failed to send reminder" });
    }
  }
);

// Download fee receipt
router.get(
  "/receipt/:payment_id",
  authMiddleware(["admin", "teacher", "student", "support_staff"]),
  async (req, res) => {
    const startTime = Date.now();
    const { payment_id } = req.params;
    console.log("[FeeRoutes] Generating receipt:", { payment_id });

    try {
      const payment = await prisma.feePayment.findUnique({
        where: { id: parseInt(payment_id) },
        include: {
          student: {
            include: {
              user: true,
            },
          },
          fee_structure: true,
        },
      });

      if (!payment) {
        console.warn("[FeeRoutes] Payment not found for receipt:", { payment_id });
        return res.status(404).json({ error: "Payment not found" });
      }

      // Check access permissions
      if (
        req.user.role === "student" &&
        req.user.user_id !== payment.student_id
      ) {
        console.warn("[FeeRoutes] Unauthorized receipt access attempt:", {
          userId: req.user.user_id,
          payment_id,
          studentId: payment.student_id
        });
        return res.status(403).json({ error: "Access denied" });
      }

      const receipt = generateFeeReceipt(
        payment,
        payment.student,
        payment.fee_structure
      );

      console.log("[FeeRoutes] Receipt generated successfully:", {
        payment_id,
        receipt_number: payment.receipt_number,
        duration: Date.now() - startTime
      });

      res.json(receipt);
    } catch (error) {
      console.error("[FeeRoutes] Error generating receipt:", {
        error: error.message,
        stack: error.stack,
        payment_id,
        duration: Date.now() - startTime
      });
      res.status(500).json({ error: "Failed to generate receipt" });
    }
  }
);

// Get students by class
router.get(
  "/students-by-class/:class_id",
  authMiddleware(["admin", "teacher", "support_staff"]),
  async (req, res) => {
    const startTime = Date.now();
    const { class_id } = req.params;
    console.log("[FeeRoutes] Getting students by class:", { class_id });

    try {
      const students = await prisma.student.findMany({
        where: {
          class_id: class_id,
          user: {
            is_active: true
          }
        },
        include: {
          user: {
            select: {
              user_id: true,
              name: true
            }
          },
          fee_structure: {
            select: {
              id: true,
              amount: true,
              payment_type: true,
              subject: true,
              class_id: true,
              valid_from: true,
              valid_until: true
            }
          }
        },
        orderBy: {
          user: {
            name: "asc"
          }
        }
      });

      const formattedStudents = students.map(student => ({
        student_id: student.user.user_id,
        name: student.user.name,
        class_id: student.class_id,
        fee_structure: student.fee_structure
      }));

      console.log("[FeeRoutes] Retrieved students by class:", {
        class_id,
        count: students.length,
        duration: Date.now() - startTime
      });

      res.json(formattedStudents);
    } catch (error) {
      console.error("[FeeRoutes] Error fetching students by class:", {
        error: error.message,
        stack: error.stack,
        class_id,
        duration: Date.now() - startTime
      });
      res.status(500).json({ error: "Failed to fetch students" });
    }
  }
);

// Get payment status by class
router.get("/status", authMiddleware(["admin", "teacher", "support_staff"]), async (req, res) => {
  const startTime = Date.now();
  const { class_id } = req.query;
  console.log("[FeeRoutes] Getting payment status:", { class_id });

  try {
    const students = await prisma.student.findMany({
      where: {
        ...(class_id && { class_id }),
      },
      include: {
        user: {
          select: {
            name: true
          }
        },
        fee_structure: true,
        fee_payments: {
          orderBy: { payment_date: "desc" }
        }
      }
    });

    const statuses = students.map(student => {
      const totalFee = student.fee_structure?.amount || 0;
      const paidAmount = student.fee_payments.reduce((sum, p) => sum + p.amount_paid, 0);
      const pendingAmount = Math.max(0, totalFee - paidAmount);
      const lastPayment = student.fee_payments[0]?.payment_date || null;
      
      // Calculate monthly status
      const monthlyStatus = {};
      const currentYear = new Date().getFullYear();
      const months = Array.from({ length: 12 }, (_, i) => {
        const date = new Date(currentYear, i);
        return date.toLocaleString('en-US', { month: 'long' });
      });

      months.forEach(month => {
        const monthPayments = student.fee_payments.filter(p => {
          const paymentMonth = new Date(p.payment_date).toLocaleString('en-US', { month: 'long' });
          return paymentMonth === month;
        });

        const monthlyPaid = monthPayments.reduce((sum, p) => sum + p.amount_paid, 0);
        const monthlyDue = totalFee / 12; // Assuming even distribution across months

        monthlyStatus[month] = {
          status: monthlyPaid >= monthlyDue ? 'PAID' : 'PENDING',
          amount: monthlyPaid,
          dueDate: new Date(currentYear, months.indexOf(month) + 1, 5).toISOString() // Due by 5th of next month
        };
      });

      let status = "PENDING";
      if (paidAmount >= totalFee) status = "PAID";
      else if (paidAmount > 0) status = "PARTIALLY_PAID";

      return {
        student_id: student.user_id,
        student_name: student.user.name,
        class_id: student.class_id,
        total_fee: totalFee,
        paid_amount: paidAmount,
        pending_amount: pendingAmount,
        last_payment: lastPayment,
        payment_status: status,
        monthly_status: monthlyStatus
      };
    });

    console.log("[FeeRoutes] Payment status retrieved successfully:", {
      class_id,
      studentCount: students.length,
      totalPendingAmount: statuses.reduce((sum, s) => sum + s.pending_amount, 0),
      statusDistribution: statuses.reduce((acc, s) => {
        acc[s.payment_status] = (acc[s.payment_status] || 0) + 1;
        return acc;
      }, {}),
      duration: Date.now() - startTime
    });

    res.json(statuses);
  } catch (error) {
    console.error("[FeeRoutes] Error getting payment status:", {
      error: error.message,
      stack: error.stack,
      class_id,
      requestedBy: req.user.user_id,
      duration: Date.now() - startTime
    });
    res.status(500).json({ error: "Failed to fetch payment status" });
  }
});

module.exports = router;
