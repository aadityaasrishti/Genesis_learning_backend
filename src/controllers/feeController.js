const { prisma } = require("../config/prisma");
const { generateReceiptNumber } = require("../utils/feeUtils");

// Fee Structure Management
exports.createFeeStructure = async (req, res) => {
  const startTime = Date.now();
  console.log("[FeeController] Creating fee structure:", {
    ...req.body,
    createdBy: req.user.user_id,
    timestamp: new Date().toISOString()
  });
  
  try {
    const { class_id, subject, amount, payment_type, valid_from, valid_until } = req.body;

    const feeStructure = await prisma.feeStructure.create({
      data: {
        class_id,
        subject: subject || null,
        amount: parseFloat(amount),
        payment_type,
        valid_from: new Date(valid_from),
        valid_until: valid_until ? new Date(valid_until) : null,
      },
    });

    console.log("[FeeController] Fee structure created successfully:", {
      id: feeStructure.id,
      class_id: feeStructure.class_id,
      amount: feeStructure.amount,
      duration: Date.now() - startTime
    });

    res.json(feeStructure);
  } catch (error) {
    console.error("[FeeController] Error creating fee structure:", {
      error: error.message,
      stack: error.stack,
      body: req.body,
      duration: Date.now() - startTime
    });
    res.status(500).json({ error: "Failed to create fee structure" });
  }
};

// Fee Payment Processing
exports.processFeePayment = async (req, res) => {
  const startTime = Date.now();
  console.log("[FeeController] Processing fee payment:", {
    ...req.body,
    processedBy: req.user.user_id,
    timestamp: new Date().toISOString()
  });

  try {
    const {
      student_id,
      fee_structure_id,
      amount_paid,
      payment_mode,
      transaction_id,
      discount_amount,
      discount_reason,
      month,
    } = req.body;

    // Validate month field
    if (!month) {
      console.warn("[FeeController] Month field missing in payment request:", { 
        student_id,
        fee_structure_id 
      });
      return res.status(400).json({ error: "Month is required for fee payment" });
    }

    // Get fee structure to determine payment status
    const feeStructure = await prisma.feeStructure.findUnique({
      where: { id: parseInt(fee_structure_id) },
    });

    if (!feeStructure) {
      console.warn("[FeeController] Fee structure not found:", { fee_structure_id });
      return res.status(404).json({ error: "Fee structure not found" });
    }

    // Validate if student is assigned to this fee structure
    const student = await prisma.student.findUnique({
      where: { user_id: parseInt(student_id) },
    });

    if (!student) {
      console.warn("[FeeController] Student not found:", { student_id });
      return res.status(404).json({ error: "Student not found" });
    }

    // Check if student's fee structure matches
    if (student.fee_structure_id && student.fee_structure_id !== parseInt(fee_structure_id)) {
      console.warn("[FeeController] Fee structure mismatch:", {
        student_id,
        assigned_structure: student.fee_structure_id,
        requested_structure: fee_structure_id
      });
      return res.status(400).json({
        error: "This fee structure does not match the student's assigned fee structure",
      });
    }

    const totalPayment = parseFloat(amount_paid) + (parseFloat(discount_amount) || 0);
    const paymentStatus = totalPayment >= feeStructure.amount ? "PAID" : "PARTIALLY_PAID";
    const due_date = calculateDueDate(feeStructure.payment_type);

    const payment = await prisma.feePayment.create({
      data: {
        amount_paid: parseFloat(amount_paid),
        payment_date: new Date(),
        payment_mode,
        payment_status: paymentStatus,
        transaction_id: transaction_id || null,
        receipt_number: generateReceiptNumber(student_id),
        discount_amount: discount_amount ? parseFloat(discount_amount) : null,
        discount_reason: discount_reason || null,
        due_date,
        month: new Date(month),
        student: {
          connect: { user_id: parseInt(student_id) },
        },
        fee_structure: {
          connect: { id: parseInt(fee_structure_id) },
        },
        creator: {
          connect: { user_id: req.user.user_id },
        },
      },
      include: {
        student: {
          include: {
            user: true,
          },
        },
        fee_structure: true,
      },
    });

    // Create notification for student
    await prisma.notification.create({
      data: {
        user_id: student_id,
        message: `Fee payment of ₹${amount_paid} received. Receipt number: ${payment.receipt_number}`,
        type: "fee_payment",
      },
    });

    console.log("[FeeController] Fee payment processed successfully:", {
      payment_id: payment.id,
      student_id,
      amount: amount_paid,
      status: paymentStatus,
      receipt: payment.receipt_number,
      duration: Date.now() - startTime
    });

    res.json(payment);
  } catch (error) {
    console.error("[FeeController] Error processing fee payment:", {
      error: error.message,
      stack: error.stack,
      body: req.body,
      duration: Date.now() - startTime
    });
    res.status(500).json({ error: "Failed to process payment" });
  }
};

// Get Student Fee Details
exports.getStudentFeeDetails = async (req, res) => {
  const startTime = Date.now();
  const { student_id } = req.params;
  console.log("[FeeController] Getting student fee details:", { student_id });
  try {
    // Fetch student details with fee payments and user info
    const student = await prisma.student.findUnique({
      where: { user_id: parseInt(student_id) },
      include: {
        user: {
          select: {
            name: true,
            email: true,
          }
        },
        fee_structure: true,
        fee_payments: {
          orderBy: { payment_date: "desc" },
          include: {
            fee_structure: true,
            student: {
              include: {
                user: {
                  select: {
                    name: true
                  }
                }
              }
            }
          }
        }
      },
    });

    if (!student) {
      console.warn("[FeeController] Student not found:", { student_id });
      return res.status(404).json({ error: "Student not found" });
    }

    // Calculate payment summary
    const totalPaid = student.fee_payments.reduce((sum, payment) => sum + payment.amount_paid, 0);
    const totalFee = student.fee_structure?.amount || 0;
    const totalDue = Math.max(0, totalFee - totalPaid);

    // Transform payments to include student info
    const payments = student.fee_payments.map(payment => ({
      ...payment,
      student: {
        user: {
          name: student.user.name
        },
        class_id: student.class_id
      }
    }));

    console.log("[FeeController] Student details retrieved successfully:", {
      student_id,
      name: student.user.name,
      class_id: student.class_id,
      fee_structure: student.fee_structure,
      payments_count: payments.length,
      total_paid: totalPaid,
      total_due: totalDue,
      duration: Date.now() - startTime,
    });

    res.json({
      student: {
        ...student,
        fee_payments: payments
      },
      fee_structure: student.fee_structure,
      summary: {
        total_paid: totalPaid,
        total_due: totalDue
      }
    });
  } catch (error) {
    console.error("[FeeController] Error fetching student details:", {
      error: error.message,
      stack: error.stack,
      student_id,
      duration: Date.now() - startTime,
    });
    res.status(500).json({ error: "Failed to fetch student details" });
  }
};

// Get Fee Reports
exports.getFeeReports = async (req, res) => {
  const startTime = Date.now();
  console.log("[FeeController] Generating fee report:", {
    query: req.query,
    requestedBy: req.user.user_id,
    timestamp: new Date().toISOString()
  });

  try {
    const { start_date, end_date, class_id, payment_mode, payment_status } = req.query;

    const where = {
      ...(start_date && end_date && {
        payment_date: {
          gte: new Date(start_date),
          lte: new Date(end_date),
        },
      }),
      ...(class_id && {
        student: {
          class_id,
        },
      }),
      ...(payment_mode && { payment_mode }),
      ...(payment_status && { payment_status }),
    };

    const payments = await prisma.feePayment.findMany({
      where,
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

    // Calculate summary statistics
    const summary = {
      total_collected: payments.reduce((sum, p) => sum + p.amount_paid, 0),
      total_students: new Set(payments.map((p) => p.student_id)).size,
      payment_modes: payments.reduce((acc, p) => {
        acc[p.payment_mode] = (acc[p.payment_mode] || 0) + 1;
        return acc;
      }, {}),
      payment_status: payments.reduce((acc, p) => {
        acc[p.payment_status] = (acc[p.payment_status] || 0) + 1;
        return acc;
      }, {}),
    };

    console.log("[FeeController] Fee report generated:", {
      payment_count: payments.length,
      total_collected: summary.total_collected,
      total_students: summary.total_students,
      filters: req.query,
      duration: Date.now() - startTime
    });

    res.json({
      payments,
      summary,
      totalAmount: summary.total_collected,
      totalPayments: payments.length
    });
  } catch (error) {
    console.error("[FeeController] Error generating fee report:", {
      error: error.message,
      stack: error.stack,
      query: req.query,
      duration: Date.now() - startTime
    });
    res.status(500).json({ error: "Failed to generate report" });
  }
};

// Helper function to calculate due date based on payment type
function calculateDueDate(paymentType) {
  const date = new Date();
  switch (paymentType) {
    case "MONTHLY":
      date.setMonth(date.getMonth() + 1);
      break;
    case "QUARTERLY":
      date.setMonth(date.getMonth() + 3);
      break;
    case "YEARLY":
      date.setFullYear(date.getFullYear() + 1);
      break;
    default:
      // For ONE_TIME and INSTALLMENT, due date is end of current month
      date.setMonth(date.getMonth() + 1, 0);
  }
  return date;
}

exports.sendFeeReminder = async (studentId, paymentId, reminderType) => {
  const startTime = Date.now();
  console.log("[FeeController] Sending fee reminder:", { studentId, paymentId, reminderType });
  try {
    const student = await prisma.student.findUnique({
      where: { user_id: studentId },
      include: {
        user: true,
        payments: {
          where: { id: paymentId },
          include: { fee_structure: true },
        },
      },
    });

    if (!student) {
      console.warn("[FeeController] Student not found for reminder:", { studentId });
      return false;
    }

    const payment = student.payments[0];
    if (!payment) {
      console.warn("[FeeController] Payment not found for reminder:", { paymentId });
      return false;
    }

    const dueAmount = payment.fee_structure.amount - payment.amount_paid;
    if (dueAmount <= 0) {
      console.log("[FeeController] No due amount for reminder:", { 
        studentId, 
        paymentId,
        duration: Date.now() - startTime 
      });
      return false;
    }

    await prisma.notification.create({
      data: {
        user_id: studentId,
        type: "fee_reminder",
        message: `Reminder: Fee payment of ₹${dueAmount} is pending for receipt ${payment.receipt_number}`,
      },
    });

    console.log("[FeeController] Fee reminder sent successfully:", {
      studentId,
      paymentId,
      dueAmount,
      duration: Date.now() - startTime
    });

    return true;
  } catch (error) {
    console.error("[FeeController] Error sending fee reminder:", {
      error: error.message,
      stack: error.stack,
      studentId,
      paymentId,
      duration: Date.now() - startTime
    });
    return false;
  }
};
