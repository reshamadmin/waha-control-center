import { Router } from "express";
import crypto from "node:crypto";
import { requireAuth } from "../../application/auth.js";
import { WahaService } from "../../infrastructure/providers/WahaService.js";
import { pool } from "../../infrastructure/db.js";
import { logger } from "../../infrastructure/logger.js";

const router = Router();
const wahaService = new WahaService();

// helper helper to parse template variables
function compileTemplate(body: string, variables: Record<string, string>): string {
  let compiled = body;
  for (const [key, value] of Object.entries(variables)) {
    compiled = compiled.replace(new RegExp(`\\{\\{${key}\\}\\}`, "gi"), value || "");
  }
  return compiled;
}

async function getSessionDetails(userId: string) {
  const [rows] = await pool.execute<any[]>(
    "SELECT whatsapp_session_name FROM user_credentials WHERE user_id = ? LIMIT 1",
    [userId]
  );
  if (rows.length === 0) return null;
  return rows[0].whatsapp_session_name || "default";
}

// POST /whatsapp/broadcasts - Creates campaign, runs validation report, and populates queue
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

      // Standardize phone format (only digits)
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
          id, broadcast_id, phone, variables, status, retry_count
        ) VALUES (?, ?, ?, ?, 'pending', 0)`,
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
             SUM(CASE WHEN q.status = 'failed' THEN 1 ELSE 0 END) as failed_count, 
             SUM(CASE WHEN q.status = 'pending' THEN 1 ELSE 0 END) as pending_count
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

// GET /whatsapp/broadcasts/:id - Detailed analytics dashboard with ETA calculations (Refinement 9)
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
              SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
              SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
       FROM broadcast_queue
       WHERE broadcast_id = ?`,
      [id]
    );

    const stats = statRows[0];
    const total = stats.total || 0;
    const sent = stats.sent || 0;
    const failed = stats.failed || 0;
    const pending = stats.pending || 0;

    // ETA calculation
    let etaSeconds = 0;
    if (campaign.status === "RUNNING" && pending > 0) {
      let delayMin = 5;
      let delayMax = 15;
      try {
        const rules = JSON.parse(campaign.sending_rules || "{}");
        delayMin = Number(rules.randomDelayMin) || 5;
        delayMax = Number(rules.randomDelayMax) || 15;
      } catch {}
      
      const avgDelay = (delayMin + delayMax) / 2;
      etaSeconds = pending * avgDelay;
    }

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

// POST /whatsapp/broadcasts/:id/dry-run - Send compiled templates only to Me (Refinement 11)
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

    // Compile templates using admin details or mock parameters
    const mockVariables = { name: authUser.name, phone: authUser.email };
    const compiledText = compileTemplate(campaign.template_body, mockVariables);

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

// POST /whatsapp/broadcasts/:id/pause - Pauses the running execution
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

// POST /whatsapp/broadcasts/:id/resume - Resumes campaign queue (Refinement 8)
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

// POST /whatsapp/broadcasts/:id/retry-failed - Retries failed queue items (Refinement 8)
router.post("/:id/retry-failed", requireAuth, async (req, res, next) => {
  try {
    const authUser = res.locals.authUser;
    const { id } = req.params;

    // Set failed messages back to pending, preserving past successful dispatches
    await pool.execute(
      "UPDATE broadcast_queue SET status = 'pending', error_message = NULL, retry_count = 0 WHERE broadcast_id = ? AND status = 'failed'",
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
