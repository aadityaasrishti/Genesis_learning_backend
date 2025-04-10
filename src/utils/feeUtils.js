const { prisma } = require("../config/prisma");
const crypto = require("crypto");
const { getSchoolInfo } = require("./schoolUtils");

// Generate unique receipt number
const generateReceiptNumber = (studentId, timestamp = Date.now()) => {
  console.log("[FeeUtils] Generating receipt number:", { studentId, timestamp });
  const dateStr = new Date(timestamp)
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, "");
  const random = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0");
  const receiptNumber = `RCP-${dateStr}-${studentId}-${random}`;
  console.log("[FeeUtils] Receipt number generated:", { receiptNumber });
  return receiptNumber;
};

// Calculate late fee if applicable
const calculateLateFee = (dueDate, amount) => {
  console.log("[FeeUtils] Calculating late fee:", { dueDate, amount });
  const now = new Date();
  const due = new Date(dueDate);

  if (now <= due) {
    console.log("[FeeUtils] No late fee applicable - payment within due date");
    return 0;
  }

  const daysLate = Math.floor((now - due) / (1000 * 60 * 60 * 24));
  const lateFeePercentage = (daysLate / 30) * 1;
  const lateFee = Math.min(amount * (lateFeePercentage / 100), amount * 0.1);

  console.log("[FeeUtils] Late fee calculated:", {
    daysLate,
    lateFeePercentage,
    lateFee,
    amount
  });
  return lateFee;
};

// Send fee reminder notification
const sendFeeReminder = async (student_id, payment_id, reminderType) => {
  console.log("[FeeUtils] Sending fee reminder:", {
    student_id,
    payment_id,
    reminderType
  });

  try {
    const student = await prisma.student.findUnique({
      where: { user_id: student_id },
      include: { user: true },
    });

    if (!student) {
      console.error("[FeeUtils] Student not found for reminder:", { student_id });
      throw new Error("Student not found");
    }

    const messages = {
      DUE_DATE: "Your fee payment is due soon.",
      OVERDUE: "Your fee payment is overdue. Please clear the pending amount.",
      FINAL_NOTICE: "FINAL NOTICE: Your fee payment is severely overdue.",
    };

    const reminder = await prisma.feeReminder.create({
      data: {
        student_id,
        payment_id,
        reminder_type: reminderType,
        message: messages[reminderType],
        status: "SENT",
      },
    });

    // Create notification
    await prisma.notification.create({
      data: {
        user_id: student_id,
        message: messages[reminderType],
        type: "fee_reminder",
      },
    });

    console.log("[FeeUtils] Fee reminder sent successfully:", {
      student_id,
      payment_id,
      reminderType,
      reminderId: reminder.id
    });

    return true;
  } catch (error) {
    console.error("[FeeUtils] Error sending fee reminder:", {
      error: error.message,
      stack: error.stack,
      student_id,
      payment_id,
      reminderType
    });
    return false;
  }
};

// Generate fee receipt
const generateFeeReceipt = (payment, student, feeStructure) => {
  console.log("[FeeUtils] Generating fee receipt:", {
    payment_id: payment.id,
    student_id: student.user_id,
    receipt_number: payment.receipt_number
  });

  const schoolInfo = getSchoolInfo();
  const receipt = {
    ...payment,
    student: {
      ...student,
      user: student.user,
    },
    fee_structure: feeStructure,
    school: schoolInfo
  };

  console.log("[FeeUtils] Fee receipt generated successfully");
  return receipt;
};

module.exports = {
  generateReceiptNumber,
  calculateLateFee,
  sendFeeReminder,
  generateFeeReceipt,
};
