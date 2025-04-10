const fs = require("fs").promises;
const path = require("path");
const { prisma } = require("../config/prisma");

const deleteFile = async (filePath) => {
  try {
    if (!filePath) return;

    const fullPath = path.join(__dirname, "../../", filePath);
    await fs.unlink(fullPath);
    console.log(`Successfully deleted file: ${filePath}`);
  } catch (error) {
    if (error.code !== "ENOENT") {
      // Ignore if file doesn't exist
      console.error(`Error deleting file ${filePath}:`, error);
    }
  }
};

const deleteTestFiles = async (test) => {
  if (test.type === "PDF") {
    await deleteFile(test.content);
  }

  // Delete all associated submission files
  const submissions = await prisma.testSubmission.findMany({
    where: { test_id: test.id },
  });

  for (const submission of submissions) {
    await deleteFile(submission.content);
  }
};

module.exports = {
  deleteFile,
  deleteTestFiles,
};
