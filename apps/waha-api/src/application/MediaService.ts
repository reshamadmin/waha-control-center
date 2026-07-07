import crypto from "node:crypto";
import path from "node:path";
import sharp from "sharp";
import { UploadedFileResponse } from "../domain/StorageProvider.js";
import { S3StorageProvider } from "../infrastructure/providers/S3StorageProvider.js";
import { logger } from "../infrastructure/logger.js";

export class MediaService {
  private storageProvider = new S3StorageProvider();

  // Refinement 5: Extensible validator pipeline (Size, MIME, and extension validation)
  async validateFile(buffer: Buffer, fileName: string, mimeType: string): Promise<void> {
    const sizeLimit = 100 * 1024 * 1024; // 100MB standard threshold limit
    if (buffer.length > sizeLimit) {
      throw new Error(`File size exceeds the 100MB limit (size: ${(buffer.length / 1024 / 1024).toFixed(1)}MB).`);
    }

    const ext = path.extname(fileName).toLowerCase();
    const disallowedExtensions = [".exe", ".bat", ".sh", ".cmd", ".vbs", ".scr", ".js", ".ts"];
    if (disallowedExtensions.includes(ext)) {
      throw new Error(`Forbidden file extension: ${ext}. Executable uploads are blocked.`);
    }

    const disallowedMimeTypes = ["application/x-msdownload", "application/javascript"];
    if (disallowedMimeTypes.includes(mimeType)) {
      throw new Error(`Forbidden MIME Type: ${mimeType}. Upload blocked.`);
    }

    logger.debug({ fileName, mimeType }, "File passed malware-security extension and MIME check policies.");
  }

  // Refinement 6 & 8: Image optimizations and thumbnail generation
  async processAndUpload(buffer: Buffer, fileName: string, mimeType: string): Promise<UploadedFileResponse> {
    // 1. Run validation pipeline
    await this.validateFile(buffer, fileName, mimeType);

    // 2. Identify if file is an image
    const isImage = mimeType.startsWith("image/") && !mimeType.includes("gif");

    let finalBuffer = buffer;
    let thumbnailBuffer: Buffer | undefined = undefined;
    let width: number | undefined = undefined;
    let height: number | undefined = undefined;

    if (isImage) {
      try {
        const metadata = await sharp(buffer).metadata();
        width = metadata.width;
        height = metadata.height;

        // Compress original image (JPG quality 85)
        finalBuffer = await sharp(buffer)
          .jpeg({ quality: 85, force: false })
          .png({ quality: 85, force: false })
          .webp({ quality: 85, force: false })
          .toBuffer();

        // Generate thumbnail (max width 200px)
        thumbnailBuffer = await sharp(buffer)
          .resize(200, null, { withoutEnlargement: true })
          .toBuffer();
      } catch (err: any) {
        logger.warn({ error: err.message }, "Image optimization failed, uploading raw original");
      }
    }

    // 3. Upload files to Storage provider
    const originalRes = await this.storageProvider.uploadFile(finalBuffer, fileName, mimeType);
    
    if (thumbnailBuffer) {
      try {
        const ext = path.extname(fileName);
        const thumbName = `thumb_${path.basename(fileName, ext)}${ext}`;
        const thumbRes = await this.storageProvider.uploadFile(thumbnailBuffer, thumbName, mimeType);
        originalRes.thumbnailUrl = thumbRes.url;
      } catch (err) {
        logger.warn({ error: err }, "Failed to upload thumbnail, continuing without it");
      }
    }

    originalRes.width = width;
    originalRes.height = height;

    return originalRes;
  }
}
