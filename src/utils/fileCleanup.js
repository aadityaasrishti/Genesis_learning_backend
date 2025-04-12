const fs = require("fs").promises;
const path = require("path");
const { prisma } = require("../config/prisma");

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
  if (test.type === "PDF") {
    await deleteFile(test.content);
  }

  // Delete all associated submission files
  const submissions = await prisma.testSubmission.findMany({
    where: { test_id: test.id },
  });

  // Delete all submission files in parallel
  await Promise.all(
    submissions.map((submission) => deleteFile(submission.content))
  );
};

module.exports = {
  deleteFile,
  deleteTestFiles,
};
