export interface WhatsAppProvider {
  getSessionStatus(sessionName: string): Promise<"CONNECTED" | "SCAN_QR" | "DISCONNECTED">;
  startSession(sessionName: string): Promise<void>;
  stopSession(sessionName: string): Promise<void>;
  getQrCode(sessionName: string): Promise<string | null>;
  sendText(sessionName: string, toPhone: string, text: string): Promise<{ wahaMessageId: string }>;
  sendFile(sessionName: string, toPhone: string, fileUrl: string, filename: string, caption?: string): Promise<{ wahaMessageId: string }>;
}
