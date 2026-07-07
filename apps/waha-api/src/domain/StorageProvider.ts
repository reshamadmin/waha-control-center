export interface UploadedFileResponse {
  url: string;
  thumbnailUrl?: string;
  mimeType: string;
  filename: string;
  filesize: number;
  width?: number;
  height?: number;
  checksum?: string;
}

export interface StorageProvider {
  uploadFile(fileBuffer: Buffer, fileName: string, mimeType: string): Promise<UploadedFileResponse>;
  getSignedUrl(filePath: string): Promise<string>;
}
