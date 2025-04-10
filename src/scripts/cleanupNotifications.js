const { prisma } = require("../config/prisma");

const cleanupNotifications = async () => {
  try {
    console.log("Starting notification cleanup...");
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Delete read notifications older than 30 days
    const deleteResult = await prisma.notification.deleteMany({
      where: {
        is_read: true,
        created_at: {
          lt: thirtyDaysAgo,
        },
      },
    });

    console.log(`Cleaned up ${deleteResult.count} old notifications`);

    // Archive unread notifications older than 90 days
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const archiveResult = await prisma.notification.updateMany({
      where: {
        is_read: false,
        created_at: {
          lt: ninetyDaysAgo,
        },
      },
      data: {
        is_read: true,
      },
    });

    console.log(`Archived ${archiveResult.count} old unread notifications`);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Delete read assignment and fee notifications older than 7 days
    await prisma.notification.deleteMany({
      where: {
        is_read: true,
        type: {
          in: [
            "assignment",
            "assignment_submission",
            "assignment_graded",
            "fee_payment",
            "fee_reminder",
            "salary_payment",
            "salary_update",
          ],
        },
        created_at: {
          lt: sevenDaysAgo,
        },
      },
    });

    // Delete read exam notifications after exam date
    const examNotifications = await prisma.notification.findMany({
      where: {
        is_read: true,
        type: "exam_notification",
      },
      include: {
        user: true,
      },
    });

    for (const notification of examNotifications) {
      const examDate = notification.message.match(
        /Due on (\d{1,2}\/\d{1,2}\/\d{4})/
      );
      if (examDate && examDate[1]) {
        const date = new Date(examDate[1]);
        if (date < new Date()) {
          await prisma.notification.delete({
            where: { id: notification.id },
          });
        }
      }
    }

    console.log("Notification cleanup completed successfully");

    return {
      deletedCount: deleteResult.count,
      archivedCount: archiveResult.count,
    };
  } catch (error) {
    console.error("Error during notification cleanup:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
};

// Run cleanup if script is executed directly
if (require.main === module) {
  cleanupNotifications()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = cleanupNotifications;
