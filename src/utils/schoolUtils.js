const getSchoolInfo = () => ({
  name: process.env.SCHOOL_NAME,
  address: process.env.SCHOOL_ADDRESS,
});

module.exports = {
  getSchoolInfo,
};