const fs = require("fs");
const path = require("path");

function initializeUploadDirectories() {
  const dirs = [
    "uploads/tests",
    "uploads/submissions",
    "uploads/notes",
    "uploads/profile-images",
    "uploads/mcq-images",
    "uploads/syllabi",
    "uploads/student-requests",
    "uploads/assignments"
  ];

  const rootDir = path.resolve(__dirname, "../../");

  dirs.forEach((dir) => {
    const fullPath = path.join(rootDir, dir);
    if (!fs.existsSync(fullPath)) {
      try {
        fs.mkdirSync(fullPath, { recursive: true });
        console.log(`Created directory: ${fullPath}`);
      } catch (error) {
        console.error(`Error creating directory ${fullPath}:`, error);
      }
    } else {
      console.log(`Directory already exists: ${fullPath}`);
    }
  });
}

module.exports = initializeUploadDirectories;
