export interface NotificationProvider {
  sendPush(userId: string, title: string, body: string): Promise<void>;
}
