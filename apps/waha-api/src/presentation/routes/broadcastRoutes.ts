import { Router } from "express";
import crypto from "node:crypto";
import { requireAuth } from "../../application/auth.js";
import { WahaService } from "../../infrastructure/providers/WahaService.js";
import { pool } from "../../infrastructure/db.js";
import { logger } from "../../infrastructure/logger.js";
import { TemplateEngine } from "../../application/TemplateEngine.js";
import { jobEngine } from "../server.js";

const router = Router();
const wahaService = new WahaService();
const templateEngine = new TemplateEngine();

async function getSessionDetails(userId: string) {
  const [rows] = await pool.execute<any[]>(
    "SELECT whatsapp_session_name FROM user_credentials WHERE user_id = ? LIMIT 1",
    [userId]
  );
  if (rows.length === 0) return null;
  return rows[0].whatsapp_session_name || "default";
}

// GET /whatsapp/broadcasts/worker/metrics - Refinement 8: Worker Metrics Panel
router.get("/worker/metrics", requireAuth, (req, res) => {
  res.json({
    status: "success",
    metrics: jobEngine.getMetrics()
  });
});

// POST /whatsapp/broadcasts - Creates campaign, validates variables, and populates queue
router.post("/", requireAuth, async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const authUser = res.locals.authUser;
    const { title, recipients = [], mappedFields = {}, templateBody, mediaAttachments = [], sendingRules = {}, scheduledAt } = req.body;

    if (!title || !templateBody) {
      res.status(400).json({
        status: "error",
        code: "VALIDATION_ERROR",
        message: "Title and Template Body are required."
      });
      return;
    }

    // Refinement 4: Variable validation (Check for unknown variables before queueing)
    const csvHeaders = recipients.length > 0 ? Object.keys(recipients[0]) : [];
    const unknownVars = templateEngine.validate(templateBody, csvHeaders);

    if (unknownVars.length > 0) {
      res.status(400).json({
        status: "error",
        code: "UNKNOWN_VARIABLES",
        message: `Unknown variable(s) present in template: ${unknownVars.map(v => `{{${v}}}`).join(", ")}`,
        variables: unknownVars
      });
      return;
    }

    const broadcastId = `brd_${crypto.randomUUID()}`;

    // Contact Validation Pipeline (Refinement 5: Validation Report)
    const validRows: any[] = [];
    const invalidRows: any[] = [];
    const duplicateRows: any[] = [];
    const seenPhones = new Set<string>();
    let emptyCount = 0;

    const phoneCol = mappedFields.phoneColumn || "phone";
    const nameCol = mappedFields.nameColumn || "name";

    for (const row of recipients) {
      const rawPhone = String(row[phoneCol] || "").trim();
      const rawName = String(row[nameCol] || "").trim();

      if (!rawPhone) {
        emptyCount++;
        continue;
      }

      const cleanPhone = rawPhone.replace(/\D/g, "");

      if (cleanPhone.length < 10 || cleanPhone.length > 15) {
        invalidRows.push({ ...row, error: "Invalid digits length (must be 10-15 digits)" });
        continue;
      }

      if (seenPhones.has(cleanPhone)) {
        duplicateRows.push({ ...row, error: "Duplicate phone number in CSV" });
        continue;
      }

      seenPhones.add(cleanPhone);
      validRows.push({
        phone: cleanPhone,
        name: rawName,
        variables: row
      });
    }

    const validationReport = {
      totalRows: recipients.length,
      validCount: validRows.length,
      invalidCount: invalidRows.length,
      duplicateCount: duplicateRows.length,
      emptyCount,
      rejectedRows: [...invalidRows, ...duplicateRows]
    };

    // Insert Campaign details
    await connection.beginTransaction();

    await connection.execute(
      `INSERT INTO broadcasts (
        id, user_id, title, status, template_body, media_attachments, sending_rules, scheduled_at
      ) VALUES (?, ?, ?, 'DRAFT', ?, ?, ?, ?)`,
      [
        broadcastId,
        authUser.id,
        title,
        templateBody,
        JSON.stringify(mediaAttachments),
        JSON.stringify(sendingRules),
        scheduledAt ? new Date(scheduledAt) : null
      ]
    );

    // Insert into queue
    for (const item of validRows) {
      const taskId = `tsk_${crypto.randomUUID()}`;
      await connection.execute(
        `INSERT INTO broadcast_queue (
          id, broadcast_id, phone, variables, status, attempts, retry_count
        ) VALUES (?, ?, ?, ?, 'pending', 0, 0)`,
        [
          taskId,
          broadcastId,
          item.phone,
          JSON.stringify(item.variables)
        ]
      );
    }

    await connection.commit();

    res.json({
      status: "success",
      broadcastId,
      validationReport
    });
  } catch (err) {
    await connection.rollback();
    next(err);
  } finally {
    connection.release();
  }
});

// GET /whatsapp/broadcasts - Lists campaigns with dynamic analytics aggregate details
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const authUser = res.locals.authUser;

    const sql = `
      SELECT b.id, b.user_id, b.title, b.status, b.template_body, b.scheduled_at, b.created_at,
             COUNT(q.id) as total_queued, 
             SUM(CASE WHEN q.status = 'sent' THEN 1 ELSE 0 END) as sent_count, 
             SUM(CASE WHEN q.status = 'failed' OR q.status = 'dead_letter' THEN 1 ELSE 0 END) as failed_count, 
             SUM(CASE WHEN q.status = 'pending' OR q.status = 'processing' THEN 1 ELSE 0 END) as pending_count
      FROM broadcasts b
      LEFT JOIN broadcast_queue q ON b.id = q.broadcast_id
      WHERE b.user_id = ?
      GROUP BY b.id
      ORDER BY b.created_at DESC
    `;

    const [rows] = await pool.execute<any[]>(sql, [authUser.id]);

    res.json({
      status: "success",
      broadcasts: rows
    });
  } catch (err) {
    next(err);
  }
});

// GET /whatsapp/broadcasts/:id - Detailed analytics dashboard with ETA calculations
router.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const authUser = res.locals.authUser;
    const { id } = req.params;

    const [campaignRows] = await pool.execute<any[]>(
      "SELECT * FROM broadcasts WHERE id = ? AND user_id = ? LIMIT 1",
      [id, authUser.id]
    );

    if (campaignRows.length === 0) {
      res.status(404).json({ status: "error", message: "Campaign not found" });
      return;
    }

    const campaign = campaignRows[0];

    const [statRows] = await pool.execute<any[]>(
      `SELECT COUNT(id) as total,
              SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
              SUM(CASE WHEN status = 'failed' OR status = 'dead_letter' THEN 1 ELSE 0 END) as failed,
              SUM(CASE WHEN status = 'pending' OR status = 'processing' THEN 1 ELSE 0 END) as pending
       FROM broadcast_queue
       WHERE broadcast_id = ?`,
      [id]
    );

    const stats = statRows[0];
    const total = stats.total || 0;
    const sent = stats.sent || 0;
    const failed = stats.failed || 0;
    const pending = stats.pending || 0;

    // Refinement 5: ETA calculated as Remaining * Average Send Time (retrieved from live JobEngine metrics)
    const metrics = jobEngine.getMetrics();
    const avgSendTimeSeconds = (metrics.average_send_time_ms || 10000) / 1000;
    const etaSeconds = pending * avgSendTimeSeconds;

    res.json({
      status: "success",
      campaign: {
        id: campaign.id,
        title: campaign.title,
        status: campaign.status,
        templateBody: campaign.template_body,
        mediaAttachments: JSON.parse(campaign.media_attachments || "[]"),
        sendingRules: JSON.parse(campaign.sending_rules || "{}"),
        scheduledAt: campaign.scheduled_at,
        createdAt: campaign.created_at
      },
      analytics: {
        totalRecipients: total,
        sent,
        failed,
        pending,
        successPercentage: total > 0 ? Math.round((sent / total) * 100) : 0,
        failurePercentage: total > 0 ? Math.round((failed / total) * 100) : 0,
        etaCompletionSeconds: etaSeconds
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /whatsapp/broadcasts/:id/dry-run - Send compiled templates only to Me
router.post("/:id/dry-run", requireAuth, async (req, res, next) => {
  try {
    const authUser = res.locals.authUser;
    const { id } = req.params;
    const { phone } = req.body;

    if (!phone) {
      res.status(400).json({ status: "error", message: "Target preview phone is required." });
      return;
    }

    const [campaignRows] = await pool.execute<any[]>(
      "SELECT * FROM broadcasts WHERE id = ? AND user_id = ? LIMIT 1",
      [id, authUser.id]
    );

    if (campaignRows.length === 0) {
      res.status(404).json({ status: "error", message: "Campaign not found" });
      return;
    }

    const campaign = campaignRows[0];
    const sessionName = await getSessionDetails(authUser.id);
    if (!sessionName) {
      res.status(404).json({ status: "error", message: "No WhatsApp credentials configured." });
      return;
    }

    const mockVariables = { name: authUser.name, phone: authUser.email };
    const compiledText = templateEngine.compile(campaign.template_body, mockVariables);

    const mediaList = JSON.parse(campaign.media_attachments || "[]");

    let wahaId = "";
    if (mediaList.length > 0) {
      for (let i = 0; i < mediaList.length; i++) {
        const media = mediaList[i];
        const caption = i === 0 ? compiledText : "";
        const sendRes = await wahaService.sendFile(sessionName, phone, media.url, media.filename, caption);
        wahaId = sendRes.wahaMessageId;
      }
    } else {
      const sendRes = await wahaService.sendText(sessionName, phone, compiledText);
      wahaId = sendRes.wahaMessageId;
    }

    res.json({
      status: "success",
      message: "Dry-run message successfully dispatched.",
      wahaMessageId: wahaId
    });
  } catch (err) {
    next(err);
  }
});

// POST /whatsapp/broadcasts/:id/launch - Moves campaign status to RUNNING / SCHEDULED
router.post("/:id/launch", requireAuth, async (req, res, next) => {
  try {
    const authUser = res.locals.authUser;
    const { id } = req.params;

    const [campaignRows] = await pool.execute<any[]>(
      "SELECT scheduled_at FROM broadcasts WHERE id = ? AND user_id = ? LIMIT 1",
      [id, authUser.id]
    );

    if (campaignRows.length === 0) {
      res.status(404).json({ status: "error", message: "Campaign not found" });
      return;
    }

    const isScheduled = !!campaignRows[0].scheduled_at;
    const nextStatus = isScheduled ? "SCHEDULED" : "RUNNING";

    await pool.execute(
      "UPDATE broadcasts SET status = ? WHERE id = ? AND user_id = ?",
      [nextStatus, id, authUser.id]
    );

    res.json({
      status: "success",
      message: `Campaign successfully launched in ${nextStatus} mode.`
    });
  } catch (err) {
    next(err);
  }
});

// POST /whatsapp/broadcasts/:id/pause - Pauses campaign
router.post("/:id/pause", requireAuth, async (req, res, next) => {
  try {
    const authUser = res.locals.authUser;
    const { id } = req.params;

    await pool.execute(
      "UPDATE broadcasts SET status = 'PAUSED' WHERE id = ? AND user_id = ? AND status = 'RUNNING'",
      [id, authUser.id]
    );

    res.json({
      status: "success",
      message: "Campaign paused."
    });
  } catch (err) {
    next(err);
  }
});

// POST /whatsapp/broadcasts/:id/resume - Resumes campaign queue
router.post("/:id/resume", requireAuth, async (req, res, next) => {
  try {
    const authUser = res.locals.authUser;
    const { id } = req.params;

    await pool.execute(
      "UPDATE broadcasts SET status = 'RUNNING' WHERE id = ? AND user_id = ? AND status = 'PAUSED'",
      [id, authUser.id]
    );

    res.json({
      status: "success",
      message: "Campaign resumed."
    });
  } catch (err) {
    next(err);
  }
});

// POST /whatsapp/broadcasts/:id/stop - Refinement 10: Emergency Stop
router.post("/:id/stop", requireAuth, async (req, res, next) => {
  try {
    const authUser = res.locals.authUser;
    const { id } = req.params;

    // 1. Immediately transition state to STOPPED and record stopped timestamp
    await pool.execute(
      `UPDATE broadcasts 
       SET status = 'STOPPED', stopped_at = NOW() 
       WHERE id = ? AND user_id = ?`,
      [id, authUser.id]
    );

    // 2. Unlock queue: reset any processing or failed queue items back to pending, clearing active locks
    await pool.execute(
      `UPDATE broadcast_queue 
       SET status = 'pending', worker_id = NULL, error_message = NULL, retry_count = 0 
       WHERE broadcast_id = ? AND (status = 'processing' OR status = 'failed')`,
      [id]
    );

    logger.warn({ campaignId: id, user: authUser.id }, "🚨 Campaign Emergency Stop triggered. Queue unlocked.");

    res.json({
      status: "success",
      message: "Emergency stop executed successfully. Campaign terminated immediately and queue unlocked."
    });
  } catch (err) {
    next(err);
  }
});

// POST /whatsapp/broadcasts/:id/retry-failed - Retries failed queue items
router.post("/:id/retry-failed", requireAuth, async (req, res, next) => {
  try {
    const authUser = res.locals.authUser;
    const { id } = req.params;

    await pool.execute(
      "UPDATE broadcast_queue SET status = 'pending', error_message = NULL, attempts = 0 WHERE broadcast_id = ? AND (status = 'failed' OR status = 'dead_letter')",
      [id]
    );

    await pool.execute(
      "UPDATE broadcasts SET status = 'RUNNING' WHERE id = ? AND user_id = ?",
      [id, authUser.id]
    );

    res.json({
      status: "success",
      message: "Failed queue items set back to pending. Resuming execution."
    });
  } catch (err) {
    next(err);
  }
});

export { router as broadcastRouter };
