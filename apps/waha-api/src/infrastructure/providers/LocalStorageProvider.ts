import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { StorageProvider, UploadedFileResponse } from "../../domain/StorageProvider.js";
import { env } from "../config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class LocalStorageProvider implements StorageProvider {
  private uploadDir = path.resolve(__dirname, "../../../../public/uploads");

  async uploadFile(fileBuffer: Buffer, fileName: string, mimeType: string): Promise<UploadedFileResponse> {
    // 1. Ensure target directory exists
    await fs.mkdir(this.uploadDir, { recursive: true });

    // 2. Compute file checksum (MD5)
    const checksum = crypto.createHash("md5").update(fileBuffer).digest("hex");

    // 3. Compute safe filename (UUID_checksum.extension)
    const ext = path.extname(fileName) || ".dat";
    const uuid = crypto.randomUUID();
    const storedFileName = `${uuid}_${checksum}${ext}`;
    const filePath = path.join(this.uploadDir, storedFileName);

    // 4. Write buffer to disk
    await fs.writeFile(filePath, fileBuffer);

    const fileUrl = `${env.PUBLIC_WEB_ORIGIN.replace("3003", "3002")}/uploads/${storedFileName}`;

    return {
      url: fileUrl,
      mimeType,
      filename: fileName,
      filesize: fileBuffer.length,
      checksum
    };
  }

  async getSignedUrl(filePath: string): Promise<string> {
    // Local storage doesn't require actual expiration signatures, return flat URL
    return filePath;
  }
}
