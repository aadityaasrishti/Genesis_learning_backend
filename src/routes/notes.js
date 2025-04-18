const express = require("express");
const router = express.Router();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const multer = require("multer");
const path = require("path");
const StorageService = require("../utils/storageService");
const { authMiddleware } = require("../middleware/authMiddleware");

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = [".pdf", ".docx", ".mp4", ".webm"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Invalid file type. Only PDF, DOCX, and video files are allowed."
        )
      );
    }
  },
  limits: {
    fileSize: parseInt(process.env.FILE_UPLOAD_LIMIT_NOTES) || 104857600, // Default to 100MB if not set
  },
});

// Initialize storage service
const notesStorage = new StorageService("notes");
notesStorage.createBucketIfNotExists().catch(console.error);

// Teacher: Upload new notes/lecture
router.post(
  "/",
  authMiddleware(["teacher", "admin"]),
  upload.single("file"),
  async (req, res) => {
    try {
      const { class_id, subject, topic, description } = req.body;
      const file = req.file;
      const teacher_id = req.user.user_id;

      if (!file) {
        return res.status(400).json({ error: "File is required" });
      }

      // Validate file type
      const ext = path.extname(file.originalname).toLowerCase();
      const allowedTypes = [".pdf", ".docx", ".mp4", ".webm"];
      if (!allowedTypes.includes(ext)) {
        return res.status(400).json({
          error:
            "Invalid file type. Only PDF, DOCX, and video files are allowed.",
        });
      }

      // Set appropriate file type based on extension
      const fileType =
        ext === ".pdf" ? "PDF" : ext === ".docx" ? "DOCX" : "VIDEO";

      // Upload file to Supabase storage
      const filePath = `${Date.now()}-${file.originalname.replace(
        /\s+/g,
        "-"
      )}`;
      const fileUrl = await notesStorage.uploadFile(file, filePath);

      const note = await prisma.notes.create({
        data: {
          teacher_id,
          class_id,
          subject,
          topic,
          description,
          file_url: fileUrl,
          file_type: fileType,
          status: "PENDING",
        },
      });

      // Create notification for admin
      await prisma.notification.create({
        data: {
          user_id: 1, // Assuming admin has user_id 1
          message: `New ${fileType.toLowerCase()} uploaded for ${subject} by $(
            req.user.name
          ) pending approval`,
          type: "notes_upload",
        },
      });

      res.status(201).json(note);
    } catch (error) {
      console.error("Error creating note:", error);
      res.status(500).json({
        error: "Failed to upload notes",
        details:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
);

// Admin: Get all notes
router.get("/all", authMiddleware(["admin"]), async (req, res) => {
  try {
    const notes = await prisma.notes.findMany({
      include: {
        teacher: {
          select: {
            name: true,
          },
        },
        approval: true,
      },
      orderBy: {
        created_at: "desc",
      },
    });
    res.json(notes);
  } catch (error) {
    console.error("Error fetching all notes:", error);
    res.status(500).json({ error: "Failed to fetch notes" });
  }
});

// Admin: Get pending approvals
router.get("/pending", authMiddleware(["admin"]), async (req, res) => {
  try {
    console.log("Fetching pending notes...");
    const pendingNotes = await prisma.notes.findMany({
      where: { status: "PENDING" },
      include: {
        teacher: {
          select: {
            name: true,
          },
        },
      },
    });
    console.log("Found pending notes:", pendingNotes);
    res.json(pendingNotes);
  } catch (error) {
    console.error("Error fetching pending notes:", error);
    res
      .status(500)
      .json({ error: "Failed to fetch pending notes", details: error.message });
  }
});

// Admin: Approve/Reject notes
router.post("/:id/review", authMiddleware(["admin"]), async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Access denied" });
    }

    const { id } = req.params;
    const { status, remarks } = req.body;

    const approval = await prisma.notesApproval.create({
      data: {
        notes_id: parseInt(id),
        admin_id: req.user.user_id,
        status,
        remarks,
      },
    });

    await prisma.notes.update({
      where: { id: parseInt(id) },
      data: { status },
    });

    res.json(approval);
  } catch (error) {
    res.status(500).json({ error: "Failed to review notes" });
  }
});

// Student: Get approved notes for their class and subject
router.get(
  "/class/:class_id/subject/:subject",
  authMiddleware(["student", "admin"]),
  async (req, res) => {
    try {
      console.log("Fetching notes with params:", req.params);
      const { class_id, subject } = req.params;

      // Log query conditions
      const queryConditions = {
        class_id,
        subject,
        status: "APPROVED",
      };
      console.log("Query conditions:", queryConditions);

      const notes = await prisma.notes.findMany({
        where: queryConditions,
        include: {
          teacher: {
            select: {
              name: true,
            },
          },
        },
        orderBy: {
          created_at: "desc",
        },
      });

      // Log the full query results
      console.log("Database query complete");
      console.log("Number of notes found:", notes.length);
      console.log("Found notes:", notes);

      res.json(notes);
    } catch (error) {
      console.error("Error fetching notes:", error);
      res.status(500).json({
        error: "Failed to fetch notes",
        details: error.message,
      });
    }
  }
);

// Teacher: Get their uploaded notes
router.get("/teacher", authMiddleware(["teacher"]), async (req, res) => {
  try {
    const notes = await prisma.notes.findMany({
      where: {
        teacher_id: req.user.user_id,
      },
      include: {
        approval: true,
      },
      orderBy: {
        created_at: "desc",
      },
    });
    res.json(notes);
  } catch (error) {
    console.error("Error fetching teacher notes:", error);
    res.status(500).json({ error: "Failed to fetch notes" });
  }
});

module.exports = router;
