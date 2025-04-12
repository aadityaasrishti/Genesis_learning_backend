const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const { prisma } = require("../config/prisma");
const { authMiddleware } = require("../middleware/authMiddleware");
const StorageService = require("../utils/storageService");

// Initialize Supabase storage for profile images
const profileStorage = new StorageService("profile-images");
profileStorage.createBucketIfNotExists().catch(console.error);

// Configure multer to use memory storage for Supabase upload
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (
      file.mimetype.startsWith("image/") ||
      file.mimetype === "image/svg+xml"
    ) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed!"), false);
    }
  },
  limits: {
    fileSize: parseInt(process.env.FILE_UPLOAD_LIMIT_PROFILE) || 5242880, // 5MB limit
  },
});

// Helper function to delete old profile image
const deleteOldProfileImage = async (imageUrl) => {
  if (!imageUrl || !imageUrl.includes("profile-images")) return;

  try {
    const fileName = imageUrl.split("/").pop();
    if (fileName) {
      await profileStorage.deleteFile(fileName);
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

      // Upload to Supabase storage
      const fileName = `profile-${userId}-${Date.now()}${path.extname(
        req.file.originalname
      )}`;
      const imageUrl = await profileStorage.uploadFile(req.file, fileName);

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
        // Delete the file from Supabase storage
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
