export interface WhatsAppProvider {
  getSessionStatus(sessionName: string): Promise<"CONNECTED" | "SCAN_QR" | "DISCONNECTED">;
  startSession(sessionName: string): Promise<void>;
  stopSession(sessionName: string): Promise<void>;
  getQrCode(sessionName: string): Promise<string | null>;
}
