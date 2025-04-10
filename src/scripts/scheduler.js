const checkDemoUsers = require('./demoUserCheck');
const checkInactiveUsers = require('./inactivityCheck');

// Run checks daily at midnight
const runDailyChecks = () => {
  setInterval(async () => {
    const now = new Date();
    if (now.getHours() === 0 && now.getMinutes() === 0) {
      console.log('Running daily user checks...');
      await checkDemoUsers();
      await checkInactiveUsers();
    }
  }, 60000); // Check every minute
};

module.exports = runDailyChecks;