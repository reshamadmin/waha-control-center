import { Router } from "express";
import crypto from "node:crypto";
import { pool } from "../db.js";
import { logger } from "../logger.js";
import { io } from "../server.js";

const router = Router();

// POST /webhooks/waha - Webhook receiver endpoint from WAHA engine
router.post("/waha", async (req, res, next) => {
  const { event, payload } = req.body;

  logger.info({ event, session: payload?.session }, "📥 Received webhook from WAHA");

  try {
    // 1. Record webhook raw audit event in database
    const webhookId = `whk_${crypto.randomUUID()}`;
    await pool.execute(
      `INSERT INTO webhook_events (id, session_name, event_type, payload, processed) 
       VALUES (?, ?, ?, ?, 1)`,
      [
        webhookId,
        payload?.session || "default",
        event || "unknown",
        JSON.stringify(req.body)
      ]
    );

    const sessionName = payload?.session || "default";

    // 2. Lookup owner user_id mapped to this session
    const [credentialRows] = await pool.execute<any[]>(
      "SELECT user_id FROM user_credentials WHERE whatsapp_session_name = ? LIMIT 1",
      [sessionName]
    );

    if (credentialRows.length === 0) {
      logger.warn({ sessionName }, "Webhook skipped: no matching user credential record found");
      res.json({ status: "skipped", message: "No owner credential found for session" });
      return;
    }

    const userId = credentialRows[0].user_id;

    // 3. Process Event Type
    if (event === "session.status") {
      const wahaStatus = payload?.status?.toUpperCase() || "DISCONNECTED";
      let mappedStatus: "CONNECTED" | "SCAN_QR" | "DISCONNECTED" = "DISCONNECTED";

      if (wahaStatus === "CONNECTED" || wahaStatus === "AUTHENTICATED") mappedStatus = "CONNECTED";
      else if (wahaStatus === "SCAN_QR" || wahaStatus === "SCAN") mappedStatus = "SCAN_QR";

      const connectedAt = mappedStatus === "CONNECTED" ? new Date() : null;

      // Update credentials status
      await pool.execute(
        `UPDATE user_credentials 
         SET whatsapp_session_status = ?, whatsapp_connected_at = ? 
         WHERE user_id = ? AND whatsapp_session_name = ?`,
        [mappedStatus, connectedAt, userId, sessionName]
      );

      // Emit live status updates via Socket.IO
      io.emit("whatsapp:status", {
        userId,
        sessionName,
        status: mappedStatus
      });

      logger.info({ sessionName, status: mappedStatus }, "Processed session status webhook and emitted update");
    } 
    
    else if (event === "message" || event === "message.received") {
      const wahaMsgId = payload?.id || `msg_${crypto.randomUUID()}`;
      const bodyText = payload?.body || "";
      const fromMe = !!payload?.fromMe;
      
      // Parse phone numbers (remove @c.us suffix if present)
      const cleanPhone = (phone: string) => phone.split("@")[0];
      
      const fromPhone = cleanPhone(payload?.from || "");
      const toPhone = cleanPhone(payload?.to || "");

      // Determine customer phone number
      const customerPhone = fromMe ? toPhone : fromPhone;
      const customerName = payload?.sender?.name || customerPhone;

      // Lookup or create chat thread
      const wahaChatId = payload?.from || `${customerPhone}@c.us`;
      
      const [chatRows] = await pool.execute<any[]>(
        "SELECT id, unread_count FROM whatsapp_chats WHERE user_id = ? AND waha_chat_id = ? LIMIT 1",
        [userId, wahaChatId]
      );

      let chatId: string;
      let currentUnread = 0;

      const lastMessageAt = new Date(payload?.timestamp * 1000 || Date.now());

      if (chatRows.length === 0) {
        // Insert new chat thread
        chatId = `cht_${crypto.randomUUID()}`;
        currentUnread = fromMe ? 0 : 1;
        await pool.execute(
          `INSERT INTO whatsapp_chats (
            id, user_id, waha_chat_id, contact_phone, contact_name, 
            last_message_at, last_message_preview, unread_count
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            chatId,
            userId,
            wahaChatId,
            customerPhone,
            customerName,
            lastMessageAt,
            bodyText.substring(0, 200),
            currentUnread
          ]
        );
      } else {
        chatId = chatRows[0].id;
        currentUnread = fromMe ? chatRows[0].unread_count : chatRows[0].unread_count + 1;
        
        // Update existing chat thread
        await pool.execute(
          `UPDATE whatsapp_chats 
           SET last_message_at = ?, last_message_preview = ?, unread_count = ? 
           WHERE id = ?`,
          [
            lastMessageAt,
            bodyText.substring(0, 200),
            currentUnread,
            chatId
          ]
        );
      }

      // Insert message archive record
      const messageId = `msg_${crypto.randomUUID()}`;
      const direction = fromMe ? "outbound" as const : "inbound" as const;
      const messageStatus = fromMe ? "sent" as const : "delivered" as const;
      
      await pool.execute(
        `INSERT INTO whatsapp_messages (
          id, chat_id, user_id, direction, waha_message_id, 
          message_type, body, status, sent_at
        ) VALUES (?, ?, ?, ?, ?, 'text', ?, ?, ?)`,
        [
          messageId,
          chatId,
          userId,
          direction,
          wahaMsgId,
          bodyText,
          messageStatus,
          lastMessageAt
        ]
      );

      // Emit live message and chat thread updates via Socket.IO
      io.emit("whatsapp:message", {
        userId,
        chatId,
        message: {
          id: messageId,
          chatId,
          direction,
          body: bodyText,
          status: messageStatus,
          sentAt: lastMessageAt
        },
        chat: {
          id: chatId,
          wahaChatId,
          contactPhone: customerPhone,
          contactName: customerName,
          lastMessageAt,
          lastMessagePreview: bodyText.substring(0, 200),
          unreadCount: currentUnread
        }
      });

      logger.info({ chatId, direction, bodyText: bodyText.substring(0, 30) }, "Processed and archived message webhook");
    }

    res.json({ status: "success" });
  } catch (err) {
    next(err);
  }
});

export { router as webhookRouter };
