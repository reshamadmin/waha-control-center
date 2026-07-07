import { Router } from "express";
import crypto from "node:crypto";
import multer from "multer";
import { requireAuth } from "../../application/auth.js";
import { WahaService } from "../../infrastructure/providers/WahaService.js";
import { pool } from "../../infrastructure/db.js";
import { logger } from "../../infrastructure/logger.js";
import { MediaService } from "../../application/MediaService.js";
import { io } from "../server.js";

const router = Router();
const wahaService = new WahaService();
const mediaService = new MediaService();

const upload = multer({ limits: { fileSize: 100 * 1024 * 1024 } });

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

// GET /whatsapp/chats/:chatId/messages - Messages list with cursor pagination and media arrays
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

    // Fetch message_media rows for each message (Refinement 2)
    for (const msg of rows) {
      const [mediaRows] = await pool.execute<any[]>(
        "SELECT id, url, thumbnail_url, mime_type, filename, filesize, width, height, duration, checksum FROM whatsapp_messages_media WHERE message_id = ?",
        [msg.id]
      );
      msg.media = mediaRows;
    }

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

// GET /whatsapp/templates - Fetch template list from MySQL
router.get("/templates", requireAuth, async (req, res, next) => {
  try {
    const [rows] = await pool.execute<any[]>(
      "SELECT id, title, category, body, variables, active FROM message_templates WHERE active = 1"
    );
    res.json({
      status: "success",
      templates: rows
    });
  } catch (err) {
    next(err);
  }
});

// POST /whatsapp/media/upload - Refinement 1: Supports files[] key multi-uploads
router.post("/media/upload", requireAuth, upload.array("files[]"), async (req, res, next) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({
        status: "error",
        code: "VALIDATION_ERROR",
        message: "No files uploaded."
      });
      return;
    }

    const uploadPromises = files.map(file => 
      mediaService.processAndUpload(file.buffer, file.originalname, file.mimetype)
    );

    const results = await Promise.all(uploadPromises);

    res.json({
      status: "success",
      files: results.map(r => ({
        url: r.url,
        thumbnailUrl: r.thumbnailUrl,
        mimeType: r.mimeType,
        filename: r.filename,
        filesize: r.filesize,
        width: r.width,
        height: r.height,
        checksum: r.checksum
      }))
    });
  } catch (err: any) {
    logger.error({ error: err.message }, "Media upload route failure");
    res.status(400).json({
      status: "error",
      code: "UPLOAD_ERROR",
      message: err.message
    });
  }
});

// POST /whatsapp/messages - Sends text/media and syncs to DB
router.post("/messages", requireAuth, async (req, res, next) => {
  try {
    const authUser = res.locals.authUser;
    const { chatId: reqChatId, phone, body, media = [] } = req.body;

    if (!body && media.length === 0) {
      res.status(400).json({
        status: "error",
        code: "VALIDATION_ERROR",
        message: "Either message body or media attachments are required."
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
          [chatId, authUser.id, wahaChatId, phone, phone, new Date(), body ? body.substring(0, 200) : "Media Attachment"]
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

    const now = new Date();
    let finalMessageObj: any = null;

    if (media.length > 0) {
      // Loop over media files and send them (Refinement 2: Message 1..N Media)
      for (let i = 0; i < media.length; i++) {
        const item = media[i];
        const caption = i === 0 ? body : ""; // Set caption on first item

        const { wahaMessageId } = await wahaService.sendFile(
          sessionName, 
          contactPhone, 
          item.url, 
          item.filename, 
          caption
        );

        const messageId = `msg_${crypto.randomUUID()}`;
        const type = item.mimeType.split("/")[0] || "document";

        // Insert message
        await pool.execute(
          `INSERT INTO whatsapp_messages (
            id, chat_id, user_id, direction, waha_message_id, 
            message_type, body, media_url, status, sent_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'sent', ?)`,
          [messageId, chatId, authUser.id, "outbound", wahaMessageId, type, caption, item.url, now]
        );

        // Insert media details (Refinement 2)
        const mediaId = `med_${crypto.randomUUID()}`;
        await pool.execute(
          `INSERT INTO whatsapp_messages_media (
            id, message_id, url, thumbnail_url, mime_type, filename, filesize, width, height, checksum
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            mediaId, 
            messageId, 
            item.url, 
            item.thumbnailUrl || null, 
            item.mimeType, 
            item.filename, 
            item.filesize || 0,
            item.width || null,
            item.height || null,
            item.checksum || null
          ]
        );

        finalMessageObj = {
          id: messageId,
          chatId,
          direction: "outbound",
          body: caption,
          status: "sent",
          sentAt: now,
          media: [{ ...item, id: mediaId }]
        };

        // Emit Socket.IO event for each message
        io.emit("whatsapp:message", {
          userId: authUser.id,
          chatId,
          message: finalMessageObj,
          chat: {
            id: chatId,
            contactPhone,
            lastMessageAt: now,
            lastMessagePreview: caption || "Media Attachment"
          }
        });
      }

      // Update chat preview
      const previewText = body || "Media Attachment";
      await pool.execute(
        `UPDATE whatsapp_chats 
         SET last_message_at = ?, last_message_preview = ? 
         WHERE id = ?`,
        [now, previewText.substring(0, 200), chatId]
      );
    } else {
      // Send text
      const { wahaMessageId } = await wahaService.sendText(sessionName, contactPhone, body);

      const messageId = `msg_${crypto.randomUUID()}`;

      await pool.execute(
        `INSERT INTO whatsapp_messages (
          id, chat_id, user_id, direction, waha_message_id, 
          message_type, body, status, sent_at
        ) VALUES (?, ?, ?, ?, ?, 'text', ?, 'sent', ?)`,
        [messageId, chatId, authUser.id, "outbound", wahaMessageId, body, now]
      );

      await pool.execute(
        `UPDATE whatsapp_chats 
         SET last_message_at = ?, last_message_preview = ? 
         WHERE id = ?`,
        [now, body.substring(0, 200), chatId]
      );

      finalMessageObj = {
        id: messageId,
        chatId,
        direction: "outbound",
        body,
        status: "sent",
        sentAt: now,
        media: []
      };

      io.emit("whatsapp:message", {
        userId: authUser.id,
        chatId,
        message: finalMessageObj,
        chat: {
          id: chatId,
          contactPhone,
          lastMessageAt: now,
          lastMessagePreview: body.substring(0, 200)
        }
      });
    }

    res.json({
      status: "success",
      message: finalMessageObj
    });
  } catch (err) {
    next(err);
  }
});

export { router as whatsappRouter };
