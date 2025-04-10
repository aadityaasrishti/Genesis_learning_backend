const { prisma } = require("../config/prisma");
const { createAssignmentNotifications } = require("../utils/notificationUtils");

const sendAssignmentReminders = async () => {
  try {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Find assignments due tomorrow that haven't had reminders sent
    const dueAssignments = await prisma.assignment.findMany({
      where: {
        due_date: {
          gte: new Date(tomorrow.setHours(0, 0, 0, 0)),
          lt: new Date(tomorrow.setHours(23, 59, 59, 999)),
        },
      },
    });

    // Send reminders for each assignment
    for (const assignment of dueAssignments) {
      const studentIds = assignment.assigned_students.split(",");
      await createAssignmentNotifications(
        studentIds,
        assignment.title,
        assignment.due_date,
        "assignment_reminder"
      );
    }

    console.log(`Sent reminders for ${dueAssignments.length} assignments`);
  } catch (error) {
    console.error("Error sending assignment reminders:", error);
  }
};

// If running directly (not imported as a module)
if (require.main === module) {
  sendAssignmentReminders()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = sendAssignmentReminders;
