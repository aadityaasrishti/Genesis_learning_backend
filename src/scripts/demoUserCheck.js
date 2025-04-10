const { prisma } = require("../config/prisma");
const { createSystemNotification, notifyAdmins } = require("../utils/notificationUtils");

const checkDemoUsers = async () => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    // Find demo users who registered more than 7 days ago and are still active
    const expiredDemoUsers = await prisma.user.findMany({
      where: {
        AND: [
          { plan_status: "demo" },
          { demo_user_flag: true },
          { is_active: true },
          { created_at: { lt: sevenDaysAgo } },
        ],
      },
      include: {
        student: true,
        teacher: true,
        adminSupportStaff: true,
      },
    });

    for (const user of expiredDemoUsers) {
      await prisma.$transaction(async (prisma) => {
        // Store role data before deactivation
        await prisma.inactiveUser.create({
          data: {
            user_id: user.user_id,
            original_role: user.role,
            role_data: user.student || user.teacher || user.adminSupportStaff,
            inactivation_date: new Date(),
          },
        });

        // Deactivate user
        await prisma.user.update({
          where: { user_id: user.user_id },
          data: {
            is_active: false,
            inactivation_date: new Date(),
          },
        });

        // Create notification for the user
        await createSystemNotification(
          prisma,
          user.user_id,
          "Your demo period has expired. Please upgrade to a permanent account to continue accessing the system."
        );

        // Notify admins
        await notifyAdmins(
          prisma,
          `Demo user (ID: ${user.user_id}, Name: ${user.name}) account has been automatically deactivated due to demo period expiration.`
        );
      });
    }

    console.log(`Processed ${expiredDemoUsers.length} expired demo users`);
  } catch (error) {
    console.error("Error checking demo users:", error);
  }
};

module.exports = checkDemoUsers;