const path = require("path");
const fs = require("fs").promises;
const { prisma } = require("../config/prisma");

// Delete files older than 30 days that are not referenced in the database
const cleanupOldFiles = async () => {
  try {
    console.log("Starting file cleanup...");

    const testUploadsDir = path.join(__dirname, "../../uploads/tests");
    const submissionUploadsDir = path.join(
      __dirname,
      "../../uploads/submissions"
    );

    // Get all files in upload directories
    const [testFiles, submissionFiles] = await Promise.all([
      fs.readdir(testUploadsDir),
      fs.readdir(submissionUploadsDir),
    ]);

    // Get all valid file paths from database
    const [tests, submissions] = await Promise.all([
      prisma.test.findMany({
        where: { type: "PDF" },
        select: { content: true },
      }),
      prisma.testSubmission.findMany({
        select: { content: true },
      }),
    ]);

    const validTestFiles = tests.map((t) => path.basename(t.content));
    const validSubmissionFiles = submissions.map((s) =>
      path.basename(s.content)
    );

    // Find and delete orphaned files
    const deleteOrphanedFiles = async (directory, files, validFiles) => {
      for (const file of files) {
        if (!validFiles.includes(file)) {
          try {
            const filePath = path.join(directory, file);
            const stats = await fs.stat(filePath);
            const fileAge = Date.now() - stats.mtime.getTime();
            const daysOld = fileAge / (1000 * 60 * 60 * 24);

            // Delete if older than 30 days
            if (daysOld > 30) {
              await fs.unlink(filePath);
              console.log(`Deleted old file: ${file}`);
            }
          } catch (err) {
            console.error(`Error processing file ${file}:`, err);
          }
        }
      }
    };

    await Promise.all([
      deleteOrphanedFiles(testUploadsDir, testFiles, validTestFiles),
      deleteOrphanedFiles(
        submissionUploadsDir,
        submissionFiles,
        validSubmissionFiles
      ),
    ]);

    console.log("File cleanup completed successfully");
  } catch (error) {
    console.error("Error during file cleanup:", error);
  }
};

module.exports = cleanupOldFiles;
