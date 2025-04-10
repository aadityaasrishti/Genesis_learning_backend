const { prisma } = require("../config/prisma");
const { createSystemNotification, notifyAdmins } = require("../utils/notificationUtils");

const checkInactiveUsers = async () => {
  try {
    const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    // Find users who haven't logged in for a month and are still active
    const inactiveUsers = await prisma.user.findMany({
      where: {
        AND: [
          { is_active: true },
          {
            OR: [
              { last_login: { lt: oneMonthAgo } },
              { last_login: null, created_at: { lt: oneMonthAgo } },
            ],
          },
        ],
      },
      include: {
        student: true,
        teacher: true,
        adminSupportStaff: true,
      },
    });

    for (const user of inactiveUsers) {
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
          "Your account has been deactivated due to inactivity (no login for 30 days). Please contact an administrator to reactivate your account."
        );

        // Notify admins
        await notifyAdmins(
          prisma,
          `User (ID: ${user.user_id}, Name: ${user.name}) account has been automatically deactivated due to 30 days of inactivity.`
        );
      });
    }

    console.log(`Processed ${inactiveUsers.length} inactive users`);
  } catch (error) {
    console.error("Error checking inactive users:", error);
  }
};

module.exports = checkInactiveUsers;