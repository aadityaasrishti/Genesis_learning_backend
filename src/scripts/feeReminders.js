const cron = require("node-cron");
const { prisma } = require("../config/prisma");

// Send fee reminder notifications
async function sendFeeReminders() {
  try {
    // Get all active permanent students
    const students = await prisma.user.findMany({
      where: {
        role: "student",
        is_active: true,
        plan_status: "permanent",
      },
      include: {
        student: true,
      },
    });

    const now = new Date();

    for (const user of students) {
      const { student } = user;
      if (!student || !student.fee_due_date) continue;

      const dueDate = new Date(student.fee_due_date);
      const daysUntilDue = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));

      // Send reminders at 7 days, 3 days, and 1 day before due date
      if ([7, 3, 1].includes(daysUntilDue)) {
        await prisma.notification.create({
          data: {
            user_id: user.user_id,
            message: `Fee payment reminder: Your fees are due in ${daysUntilDue} day${
              daysUntilDue > 1 ? "s" : ""
            }.`,
            type: "fee_reminder",
          },
        });

        // Create fee reminder record
        await prisma.feeReminder.create({
          data: {
            student_id: user.user_id,
            reminder_date: now,
            due_date: dueDate,
            status: "SENT",
          },
        });
      }

      // If fee is overdue
      if (daysUntilDue < 0) {
        await prisma.notification.create({
          data: {
            user_id: user.user_id,
            message: `Fee payment overdue: Your fees were due ${Math.abs(
              daysUntilDue
            )} days ago.`,
            type: "fee_reminder",
          },
        });

        // Update or create overdue reminder
        await prisma.feeReminder.upsert({
          where: {
            student_id_due_date: {
              student_id: user.user_id,
              due_date: dueDate,
            },
          },
          update: {
            status: "OVERDUE",
          },
          create: {
            student_id: user.user_id,
            reminder_date: now,
            due_date: dueDate,
            status: "OVERDUE",
          },
        });
      }
    }
  } catch (error) {
    console.error("Error sending fee reminders:", error);
  }
}

// Schedule reminders to run daily at midnight
function scheduleFeeReminders() {
  cron.schedule("0 0 * * *", async () => {
    console.log("Running scheduled fee reminders...");
    await sendFeeReminders();
  });
}

module.exports = {
  scheduleFeeReminders,
  sendFeeReminders, // Export for testing or manual triggers
};
