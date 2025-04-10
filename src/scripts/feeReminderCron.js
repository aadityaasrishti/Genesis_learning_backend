const { prisma } = require("../config/prisma");
const cron = require("node-cron");

async function sendMonthlyFeeReminders() {
  try {
    const today = new Date();
    // Find all students with fee_due_date matching today's date
    const students = await prisma.student.findMany({
      where: {
        fee_due_date: {
          not: null,
          // Match day of month
          equals: new Date(
            today.getFullYear(),
            today.getMonth(),
            today.getDate()
          ),
        },
        user: {
          plan_status: "permanent",
          is_active: true,
        },
      },
      include: {
        user: true,
        fee_structure: true,
      },
    });

    for (const student of students) {
      // Create reminder notification
      await prisma.notification.create({
        data: {
          user_id: student.user_id,
          message: `Monthly fee payment reminder: Your fee of ₹${
            student.fee_structure?.amount || 0
          } is due today.`,
          type: "fee_reminder",
        },
      });

      // Create fee reminder record
      await prisma.feeReminder.create({
        data: {
          student_id: student.user_id,
          reminder_type: "DUE_DATE",
          message: `Monthly fee payment is due`,
          status: "SENT",
        },
      });
    }

    console.log(`Sent fee reminders to ${students.length} students`);
  } catch (error) {
    console.error("Error sending fee reminders:", error);
  }
}

// Run every day at 9 AM
cron.schedule("0 9 * * *", sendMonthlyFeeReminders);

// Export for manual triggering if needed
module.exports = { sendMonthlyFeeReminders };
