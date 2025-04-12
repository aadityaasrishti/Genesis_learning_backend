const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { prisma } = require("../config/prisma");
const { authMiddleware } = require("../middleware/authMiddleware");

// Create profile images upload directory if it doesn't exist
const uploadDir = path.join(
  process.env.UPLOAD_BASE_PATH || path.join(__dirname, "../../uploads"),
  "profile-images"
);
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for profile image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    // Handle both SVG and regular image files
    const ext =
      file.mimetype === "image/svg+xml"
        ? ".svg"
        : path.extname(file.originalname);
    cb(null, "profile-" + uniqueSuffix + ext);
  },
});

const fileFilter = (req, file, cb) => {
  // Accept image files and SVG
  if (file.mimetype.startsWith("image/") || file.mimetype === "image/svg+xml") {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed!"), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: parseInt(process.env.FILE_UPLOAD_LIMIT_PROFILE) || 5242880, // Default to 5MB if not set
  },
});

// Helper function to delete old profile image
const deleteOldProfileImage = async (imageUrl) => {
  if (!imageUrl) return;

  try {
    const relativePath = imageUrl.split("/api/uploads/")[1];
    if (!relativePath) return;
    const fullPath = path.join(
      process.env.UPLOAD_BASE_PATH || path.join(__dirname, "../../uploads"),
      relativePath
    );
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  } catch (error) {
    console.error("Error deleting old profile image:", error);
  }
};

// Upload profile image
router.post(
  "/upload-image",
  authMiddleware(["admin", "teacher", "student", "support_staff"]),
  upload.single("image"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No image file provided" });
      }

      const userId = req.user.user_id;

      // Get current user to delete old image if exists
      const currentUser = await prisma.user.findUnique({
        where: { user_id: userId },
        select: { profile_image_url: true },
      });

      if (currentUser?.profile_image_url) {
        await deleteOldProfileImage(currentUser.profile_image_url);
      }

      // Store the file path relative to uploads directory
      const relativePath = req.file.path
        .replace(/\\/g, "/")
        .split("uploads/")[1];
      const imageUrl = `/api/uploads/${relativePath}`;

      // Update user's profile_image_url
      await prisma.user.update({
        where: { user_id: userId },
        data: { profile_image_url: imageUrl },
      });

      res.json({ success: true, imageUrl });
    } catch (error) {
      console.error("Profile image upload error:", error);
      res.status(500).json({ error: "Failed to upload profile image" });
    }
  }
);

// Remove profile image
router.delete(
  "/remove-image",
  authMiddleware(["admin", "teacher", "student", "support_staff"]),
  async (req, res) => {
    try {
      const userId = req.user.user_id;

      // Get current user's profile image
      const user = await prisma.user.findUnique({
        where: { user_id: userId },
        select: { profile_image_url: true },
      });

      if (user?.profile_image_url) {
        // Delete the file
        await deleteOldProfileImage(user.profile_image_url);

        // Update user record
        await prisma.user.update({
          where: { user_id: userId },
          data: { profile_image_url: null },
        });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Profile image removal error:", error);
      res.status(500).json({ error: "Failed to remove profile image" });
    }
  }
);

module.exports = router;
