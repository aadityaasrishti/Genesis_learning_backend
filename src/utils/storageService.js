const supabase = require("../config/supabase");
const path = require("path");

const STORAGE_URL = process.env.SUPABASE_URL + "/storage/v1/object/public";

class StorageService {
  constructor(bucketName) {
    this.bucketName = bucketName;
  }

  async uploadFile(file, filePath) {
    try {
      const { data, error } = await supabase.storage
        .from(this.bucketName)
        .upload(filePath, file.buffer, {
          contentType: file.mimetype,
          cacheControl: "3600",
          upsert: false,
        });

      if (error) throw error;

      return `${STORAGE_URL}/${this.bucketName}/${data.path}`;
    } catch (error) {
      console.error("Storage upload error:", error);
      throw error;
    }
  }

  async deleteFile(filePath) {
    try {
      const { error } = await supabase.storage
        .from(this.bucketName)
        .remove([filePath]);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error("Storage delete error:", error);
      throw error;
    }
  }

  async createBucketIfNotExists() {
    try {
      const { data: buckets } = await supabase.storage.listBuckets();
      const bucketExists = buckets.some((b) => b.name === this.bucketName);

      if (!bucketExists) {
        const { error } = await supabase.storage.createBucket(this.bucketName, {
          public: true,
          fileSizeLimit: process.env.FILE_UPLOAD_LIMIT_NOTES || 104857600,
        });
        if (error) throw error;
      }
    } catch (error) {
      console.error("Bucket creation error:", error);
      throw error;
    }
  }
}

module.exports = StorageService;
