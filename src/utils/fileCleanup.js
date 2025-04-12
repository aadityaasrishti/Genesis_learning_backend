const { prisma } = require("../config/prisma");
const StorageService = require("./storageService");

const deleteFile = async (url) => {
  try {
    if (!url) return;

    // Extract the bucket and filename from the Supabase URL
    const urlParts = url.split("/");
    const bucketName = urlParts[urlParts.length - 2];
    const fileName = urlParts[urlParts.length - 1];

    // Create a storage service instance for the appropriate bucket
    const storage = new StorageService(bucketName);
    await storage.deleteFile(fileName);

    console.log(`Successfully deleted file from ${bucketName}: ${fileName}`);
  } catch (error) {
    console.error(`Error deleting file ${url}:`, error);
  }
};

const deleteTestFiles = async (test) => {
  try {
    // Delete test content if it's a PDF
    if (test.type === "PDF" && test.content) {
      await deleteFile(test.content);
    }

    // Get all submissions for this test
    const submissions = await prisma.testSubmission.findMany({
      where: { test_id: test.id },
      select: { content: true },
    });

    // Delete all submission files in parallel
    await Promise.all(
      submissions
        .filter((submission) => submission.content)
        .map((submission) => deleteFile(submission.content))
    );

    console.log(
      `Cleaned up files for test ${test.id} and ${submissions.length} submissions`
    );
  } catch (error) {
    console.error(`Error cleaning up test files for test ${test.id}:`, error);
    throw error;
  }
};

module.exports = {
  deleteFile,
  deleteTestFiles,
};
