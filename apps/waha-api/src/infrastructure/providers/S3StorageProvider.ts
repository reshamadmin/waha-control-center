import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from "node:crypto";
import path from "node:path";
import { StorageProvider, UploadedFileResponse } from "../../domain/StorageProvider.js";
import { LocalStorageProvider } from "./LocalStorageProvider.js";
import { logger } from "../logger.js";

export class S3StorageProvider implements StorageProvider {
  private s3Client: S3Client | null = null;
  private bucketName: string = "";
  private localFallback = new LocalStorageProvider();

  constructor() {
    const endpoint = process.env.SPACES_ENDPOINT; // e.g. https://nyc3.digitaloceanspaces.com
    const key = process.env.SPACES_KEY;
    const secret = process.env.SPACES_SECRET;
    this.bucketName = process.env.SPACES_BUCKET || "";

    if (endpoint && key && secret && this.bucketName) {
      logger.info("☁️ DigitalOcean Spaces configured for media uploads.");
      this.s3Client = new S3Client({
        endpoint,
        region: "us-east-1", // DO Spaces uses us-east-1 compatible region mapping
        credentials: {
          accessKeyId: key,
          secretAccessKey: secret
        }
      });
    } else {
      logger.warn("Spaces credentials missing. Falling back to Local Storage.");
    }
  }

  async uploadFile(fileBuffer: Buffer, fileName: string, mimeType: string): Promise<UploadedFileResponse> {
    if (!this.s3Client) {
      return this.localFallback.uploadFile(fileBuffer, fileName, mimeType);
    }

    try {
      const checksum = crypto.createHash("md5").update(fileBuffer).digest("hex");
      const ext = path.extname(fileName) || ".dat";
      const uuid = crypto.randomUUID();
      const storedFileName = `${uuid}_${checksum}${ext}`;

      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: storedFileName,
        Body: fileBuffer,
        ContentType: mimeType,
        ACL: "private" // Secure by default
      });

      await this.s3Client.send(command);

      const endpointUrl = process.env.SPACES_ENDPOINT || "";
      const cleanedEndpoint = endpointUrl.replace("https://", "");
      const publicUrl = `https://${this.bucketName}.${cleanedEndpoint}/${storedFileName}`;

      return {
        url: publicUrl,
        mimeType,
        filename: fileName,
        filesize: fileBuffer.length,
        checksum
      };
    } catch (err: any) {
      logger.error({ error: err.message }, "Spaces upload failed, falling back to Local Storage");
      return this.localFallback.uploadFile(fileBuffer, fileName, mimeType);
    }
  }

  async getSignedUrl(filePath: string): Promise<string> {
    // Return direct path for local files, or S3 public/signed path for spaces.
    // If files reside on local fallback, route to local file server URL directly.
    return filePath;
  }
}
