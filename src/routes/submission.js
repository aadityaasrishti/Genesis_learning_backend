const express = require("express");
const router = express.Router();
const { prisma } = require("../config/prisma");
const authMiddleware = require("../middleware/auth");
const StorageService = require("../utils/storageService");
const multer = require("multer");

// Initialize Supabase storage service
const submissionStorage = new StorageService("submissions");

// Create bucket if it doesn't exist
submissionStorage.createBucketIfNotExists().catch(console.error);

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.FILE_UPLOAD_LIMIT_SUBMISSION) || 52428800, // Default to 50MB if not set
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"), false);
    }
  },
}).single("file");
const handleUpload = (req, res, next) => {
  upload(req, res, function (err) {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({
        error: err.message,
        code: err.code,
      });
    } else if (err) {
      return res.status(500).json({
        error: "File upload failed",
        details: err.message,
      });
    }
    next();
  });
};

// Get all submissions for a test (teacher only)
router.get("/test/:testId", authMiddleware, async (req, res) => {
  try {
    const { testId } = req.params;

    if (req.user.role !== "TEACHER") {
      return res
        .status(403)
        .json({ error: "Only teachers can view all submissions" });
    }

    const submissions = await prisma.testSubmission.findMany({
      where: {
        testId: parseInt(testId),
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    res.json(submissions);
  } catch (error) {
    console.error("Error getting submissions:", error);
    res.status(500).json({ error: "Failed to get submissions" });
  }
});

// Get student's own submission
router.get("/student/test/:testId", authMiddleware, async (req, res) => {
  try {
    const { testId } = req.params;

    if (req.user.role !== "STUDENT") {
      return res
        .status(403)
        .json({ error: "Only students can view their own submissions" });
    }

    const submission = await prisma.testSubmission.findFirst({
      where: {
        testId: parseInt(testId),
        studentId: req.user.id,
      },
    });

    if (!submission) {
      return res.status(404).json({ error: "No submission found" });
    }

    res.json(submission);
  } catch (error) {
    console.error("Error getting submission:", error);
    res.status(500).json({ error: "Failed to get submission" });
  }
});

// Submit a test (student only)
router.post(
  "/test/:testId",
  authMiddleware,
  handleFileUpload,
  async (req, res) => {
    try {
      const { testId } = req.params;
      const isLate = req.body.isLate === "true";

      if (req.user.role !== "STUDENT") {
        return res
          .status(403)
          .json({ error: "Only students can submit tests" });
      }

      // Check if student has already submitted
      const existingSubmission = await prisma.testSubmission.findFirst({
        where: {
          testId: parseInt(testId),
          studentId: req.user.id,
        },
      });

      if (existingSubmission) {
        return res
          .status(400)
          .json({ error: "You have already submitted this test" });
      }
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      // Upload to Supabase storage
      const fileName = `test-submission-${
        req.user.id
      }-${testId}-${Date.now()}-${req.file.originalname.replace(/\s+/g, "-")}`;
      const fileUrl = await submissionStorage.uploadFile(req.file, fileName);

      // Create submission record
      const submission = await prisma.testSubmission.create({
        data: {
          testId: parseInt(testId),
          studentId: req.user.id,
          content: fileUrl,
          isLate: isLate,
        },
      });

      res.status(201).json({
        ...submission,
        isLate,
        message: isLate
          ? "Test submitted after grace period"
          : "Test submitted successfully",
      });
    } catch (error) {
      console.error("Error submitting test:", error);
      res.status(500).json({ error: "Failed to submit test" });
    }
  }
);

// Grade a submission (teacher only)
router.post("/:submissionId/grade", authMiddleware, async (req, res) => {
  try {
    const { submissionId } = req.params;
    const { grade, feedback } = req.body;

    if (req.user.role !== "TEACHER") {
      return res
        .status(403)
        .json({ error: "Only teachers can grade submissions" });
    }

    if (typeof grade !== "number" || grade < 0 || grade > 100) {
      return res
        .status(400)
        .json({ error: "Grade must be a number between 0 and 100" });
    }

    const submission = await prisma.testSubmission.update({
      where: {
        id: parseInt(submissionId),
      },
      data: {
        grade,
        feedback,
      },
    });

    res.json(submission);
  } catch (error) {
    console.error("Error grading submission:", error);
    res.status(500).json({ error: "Failed to grade submission" });
  }
});

// Delete a submission
router.delete("/:submissionId", authMiddleware, async (req, res) => {
  try {
    const { submissionId } = req.params;

    // Get the submission to check ownership and get file path
    const submission = await prisma.testSubmission.findUnique({
      where: {
        id: parseInt(submissionId),
      },
    });

    if (!submission) {
      return res.status(404).json({ error: "Submission not found" });
    } // Only allow teachers or the submission owner to delete
    if (req.user.role !== "TEACHER" && submission.studentId !== req.user.id) {
      return res
        .status(403)
        .json({ error: "Not authorized to delete this submission" });
    }

    // Delete the file from Supabase storage
    if (submission.content) {
      try {
        await submissionStorage.deleteFile(submission.content.split("/").pop());
      } catch (error) {
        console.error("Error deleting file from storage:", error);
      }
    }

    // Delete the database record
    await prisma.testSubmission.delete({
      where: {
        id: parseInt(submissionId),
      },
    });

    res.json({ message: "Submission deleted successfully" });
  } catch (error) {
    console.error("Error deleting submission:", error);
    res.status(500).json({ error: "Failed to delete submission" });
  }
});

module.exports = router;
