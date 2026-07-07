import { Router } from "express";
import crypto from "node:crypto";
import { requireAuth } from "../../application/auth.js";
import { WahaService } from "../../infrastructure/providers/WahaService.js";
import { pool } from "../../infrastructure/db.js";
import { logger } from "../../infrastructure/logger.js";
import { io } from "../server.js";

const router = Router();
const wahaService = new WahaService();

// Helper to look up active user's session name
async function getSessionDetails(userId: string) {
  const [rows] = await pool.execute<any[]>(
    "SELECT whatsapp_session_name FROM user_credentials WHERE user_id = ? LIMIT 1",
    [userId]
  );
  if (rows.length === 0) return null;
  return rows[0].whatsapp_session_name || "default";
}

// GET /whatsapp/status
router.get("/status", requireAuth, async (req, res, next) => {
  try {
    const authUser = res.locals.authUser;
    const sessionName = await getSessionDetails(authUser.id);

    if (!sessionName) {
      res.status(404).json({
        status: "error",
        code: "NOT_FOUND",
        message: "No WhatsApp credentials configured for user."
      });
      return;
    }

    const wahaStatus = await wahaService.getSessionStatus(sessionName);
    await wahaService.syncSessionStatusToDb(authUser.id, sessionName);

    res.json({
      status: "success",
      session: {
        name: sessionName,
        status: wahaStatus
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /whatsapp/qr
router.get("/qr", requireAuth, async (req, res, next) => {
  try {
    const authUser = res.locals.authUser;
    const sessionName = await getSessionDetails(authUser.id);

    if (!sessionName) {
      res.status(404).json({
        status: "error",
        code: "NOT_FOUND",
        message: "No WhatsApp credentials configured for user."
      });
      return;
    }

    const wahaStatus = await wahaService.getSessionStatus(sessionName);
    
    if (wahaStatus === "CONNECTED") {
      res.json({
        status: "CONNECTED",
        message: "WhatsApp session is already connected."
      });
      return;
    }

    const qrDataUri = await wahaService.getQrCode(sessionName);
    
    if (wahaStatus === "DISCONNECTED") {
      try {
        await wahaService.startSession(sessionName);
      } catch (err: any) {
        logger.warn({ error: err.message, sessionName }, "Session start request failed while fetching QR");
      }
    }

    res.json({
      status: "SCAN_QR",
      qrCode: qrDataUri
    });
  } catch (err) {
    next(err);
  }
});

// POST /whatsapp/disconnect
router.post("/disconnect", requireAuth, async (req, res, next) => {
  try {
    const authUser = res.locals.authUser;
    
    if (authUser.role !== "ADMIN") {
      res.status(403).json({
        status: "error",
        code: "FORBIDDEN",
        message: "Only administrators can modify WhatsApp connections."
      });
      return;
    }

    const sessionName = await getSessionDetails(authUser.id);
    if (!sessionName) {
      res.status(404).json({
        status: "error",
        code: "NOT_FOUND",
        message: "No WhatsApp credentials configured for user."
      });
      return;
    }

    await wahaService.stopSession(sessionName);
    await wahaService.syncSessionStatusToDb(authUser.id, sessionName);

    res.json({
      status: "success",
      message: `WhatsApp session '${sessionName}' disconnected.`
    });
  } catch (err) {
    next(err);
  }
});

// POST /whatsapp/restart
router.post("/restart", requireAuth, async (req, res, next) => {
  try {
    const authUser = res.locals.authUser;
    
    if (authUser.role !== "ADMIN") {
      res.status(403).json({
        status: "error",
        code: "FORBIDDEN",
        message: "Only administrators can modify WhatsApp connections."
      });
      return;
    }

    const sessionName = await getSessionDetails(authUser.id);
    if (!sessionName) {
      res.status(404).json({
        status: "error",
        code: "NOT_FOUND",
        message: "No WhatsApp credentials configured for user."
      });
      return;
    }

    try {
      await wahaService.stopSession(sessionName);
    } catch {
      // Ignore stop errors if already disconnected
    }

    await wahaService.startSession(sessionName);
    await wahaService.syncSessionStatusToDb(authUser.id, sessionName);

    res.json({
      status: "success",
      message: `WhatsApp session '${sessionName}' restarted.`
    });
  } catch (err) {
    next(err);
  }
});

// GET /whatsapp/chats - Lists chats with cursor pagination and search
router.get("/chats", requireAuth, async (req, res, next) => {
  try {
    const authUser = res.locals.authUser;
    const { cursor, limit = 20, search } = req.query;

    let sql = `
      SELECT DISTINCT c.id, c.user_id, c.customer_id, c.waha_chat_id, 
                      c.contact_phone, c.contact_name, c.last_message_at, 
                      c.last_message_preview, c.unread_count
      FROM whatsapp_chats c
      LEFT JOIN whatsapp_messages m ON c.id = m.chat_id
      WHERE c.user_id = ?
    `;
    const params: any[] = [authUser.id];

    if (search) {
      sql += ` AND (c.contact_name LIKE ? OR c.contact_phone LIKE ? OR m.body LIKE ?)`;
      const searchLike = `%${search}%`;
      params.push(searchLike, searchLike, searchLike);
    }

    if (cursor) {
      sql += ` AND c.last_message_at < ?`;
      params.push(new Date(cursor as string));
    }

    sql += ` ORDER BY c.last_message_at DESC LIMIT ?`;
    params.push(Number(limit));

    const [rows] = await pool.execute<any[]>(sql, params);

    const nextCursor = rows.length === Number(limit) && rows.length > 0
      ? rows[rows.length - 1].last_message_at
      : null;

    res.json({
      status: "success",
      chats: rows,
      nextCursor
    });
  } catch (err) {
    next(err);
  }
});

// GET /whatsapp/chats/:chatId/messages - Messages list with cursor pagination
router.get("/chats/:chatId/messages", requireAuth, async (req, res, next) => {
  try {
    const authUser = res.locals.authUser;
    const { chatId } = req.params;
    const { cursor, limit = 50 } = req.query;

    let sql = `
      SELECT id, chat_id, user_id, direction, waha_message_id, 
             message_type, body, media_url, status, sent_at
      FROM whatsapp_messages
      WHERE chat_id = ? AND user_id = ?
    `;
    const params: any[] = [chatId, authUser.id];

    if (cursor) {
      sql += ` AND sent_at < ?`;
      params.push(new Date(cursor as string));
    }

    sql += ` ORDER BY sent_at DESC LIMIT ?`;
    params.push(Number(limit));

    const [rows] = await pool.execute<any[]>(sql, params);

    const nextCursor = rows.length === Number(limit) && rows.length > 0
      ? rows[rows.length - 1].sent_at
      : null;

    res.json({
      status: "success",
      messages: rows,
      nextCursor
    });
  } catch (err) {
    next(err);
  }
});

// POST /whatsapp/chats/:chatId/read - Mark chat unread count to 0
router.post("/chats/:chatId/read", requireAuth, async (req, res, next) => {
  try {
    const authUser = res.locals.authUser;
    const { chatId } = req.params;

    await pool.execute(
      "UPDATE whatsapp_chats SET unread_count = 0 WHERE id = ? AND user_id = ?",
      [chatId, authUser.id]
    );

    res.json({
      status: "success",
      message: "Chat marked as read."
    });
  } catch (err) {
    next(err);
  }
});

// POST /whatsapp/messages - Sends text and syncs to DB
router.post("/messages", requireAuth, async (req, res, next) => {
  try {
    const authUser = res.locals.authUser;
    const { chatId: reqChatId, phone, body } = req.body;

    if (!body) {
      res.status(400).json({
        status: "error",
        code: "VALIDATION_ERROR",
        message: "Message body is required."
      });
      return;
    }

    let chatId = reqChatId;
    let contactPhone = phone;

    // Look up or create chat if phone is provided
    if (!chatId && phone) {
      const [chatRows] = await pool.execute<any[]>(
        "SELECT id FROM whatsapp_chats WHERE user_id = ? AND contact_phone = ? LIMIT 1",
        [authUser.id, phone]
      );
      if (chatRows.length > 0) {
        chatId = chatRows[0].id;
      } else {
        chatId = `cht_${crypto.randomUUID()}`;
        const wahaChatId = `${phone}@c.us`;
        await pool.execute(
          `INSERT INTO whatsapp_chats (id, user_id, waha_chat_id, contact_phone, contact_name, last_message_at, last_message_preview, unread_count)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
          [chatId, authUser.id, wahaChatId, phone, phone, new Date(), body.substring(0, 200)]
        );
      }
    } else if (chatId) {
      const [chatRows] = await pool.execute<any[]>(
        "SELECT contact_phone FROM whatsapp_chats WHERE id = ? AND user_id = ? LIMIT 1",
        [chatId, authUser.id]
      );
      if (chatRows.length === 0) {
        res.status(404).json({
          status: "error",
          code: "NOT_FOUND",
          message: "Chat thread not found."
        });
        return;
      }
      contactPhone = chatRows[0].contact_phone;
    } else {
      res.status(400).json({
        status: "error",
        code: "VALIDATION_ERROR",
        message: "Either chatId or phone must be provided."
      });
      return;
    }

    const sessionName = await getSessionDetails(authUser.id);
    if (!sessionName) {
      res.status(404).json({
        status: "error",
        code: "NOT_FOUND",
        message: "No WhatsApp credentials configured for user."
      });
      return;
    }

    // Send via provider
    const { wahaMessageId } = await wahaService.sendText(sessionName, contactPhone, body);

    const messageId = `msg_${crypto.randomUUID()}`;
    const now = new Date();

    // Insert into DB
    await pool.execute(
      `INSERT INTO whatsapp_messages (
        id, chat_id, user_id, direction, waha_message_id, 
        message_type, body, status, sent_at
      ) VALUES (?, ?, ?, ?, ?, 'text', ?, 'sent', ?)`,
      [messageId, chatId, authUser.id, "outbound", wahaMessageId, body, now]
    );

    // Update chat preview
    await pool.execute(
      `UPDATE whatsapp_chats 
       SET last_message_at = ?, last_message_preview = ? 
       WHERE id = ?`,
      [now, body.substring(0, 200), chatId]
    );

    // Emit via Socket.IO
    const broadcastPayload = {
      userId: authUser.id,
      chatId,
      message: {
        id: messageId,
        chatId,
        direction: "outbound",
        body,
        status: "sent",
        sentAt: now
      },
      chat: {
        id: chatId,
        contactPhone,
        lastMessageAt: now,
        lastMessagePreview: body.substring(0, 200)
      }
    };

    io.emit("whatsapp:message", broadcastPayload);

    res.json({
      status: "success",
      message: broadcastPayload.message
    });
  } catch (err) {
    next(err);
  }
});

export { router as whatsappRouter };
