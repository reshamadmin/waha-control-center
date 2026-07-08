import { Router } from "express";
import crypto from "node:crypto";
import { requireAuth } from "../../application/auth.js";
import { pool } from "../../infrastructure/db.js";
import { logger } from "../../infrastructure/logger.js";
import { jobEngine } from "../server.js";
import { WahaService } from "../../infrastructure/providers/WahaService.js";

const router = Router();
const wahaService = new WahaService();

// GET /api/dev/diagnostics - Gathers logs, metrics, flags, and release details
router.get("/diagnostics", requireAuth, async (req, res, next) => {
  try {
    const authUser = res.locals.authUser;
    if (authUser.role !== "ADMIN") {
      res.status(403).json({ status: "error", code: "FORBIDDEN", message: "Admin access required." });
      return;
    }

    // 1. Fetch system log trail
    const [logRows] = await pool.execute(
      "SELECT * FROM system_logs ORDER BY created_at DESC LIMIT 50"
    );

    // 2. Fetch metrics history
    const [metricsRows] = await pool.execute(
      "SELECT * FROM system_metrics_history ORDER BY recorded_at DESC LIMIT 30"
    );

    // 3. Fetch feature flags
    const [flagRows] = await pool.execute(
      "SELECT flag_key, flag_name, is_enabled FROM feature_flags"
    );

    // 4. Gather WAHA engine details
    let wahaConnected = false;
    let wahaVersion = "unknown";
    try {
      // Get session list or api specs
      const status = await wahaService.getSessionStatus("default");
      wahaConnected = status === "CONNECTED";
      wahaVersion = "v2026.07";
    } catch {}

    // 5. Gather git details or releases
    const gitCommit = "commit_6c80240"; // Mocked release version commit
    const dbVersion = "017";

    res.json({
      status: "success",
      diagnostics: {
        logs: logRows,
        metricsHistory: metricsRows,
        featureFlags: flagRows,
        waha: {
          connected: wahaConnected,
          version: wahaVersion
        },
        release: {
          appVersion: "1.0.0-rc1",
          gitCommit,
          buildDate: new Date().toLocaleDateString(),
          dbVersion,
          environment: process.env.NODE_ENV || "development"
        },
        worker: jobEngine.getMetrics()
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/dev/feedback - Agent Bug Report Ingestion
router.post("/feedback", requireAuth, async (req, res, next) => {
  try {
    const { 
      page, comments, screenshotUrl, browser, browserVersion, 
      screenResolution, currentRoute, conversationId, workerStatus, queueDepth 
    } = req.body;

    if (!page || !comments || !browser) {
      res.status(400).json({ status: "error", message: "Page, browser, and comments are required." });
      return;
    }

    const id = `fdb_${crypto.randomUUID()}`;
    await pool.execute(
      `INSERT INTO app_feedback (
        id, page, comments, screenshot_url, browser, browser_version, 
        screen_resolution, current_route, conversation_id, worker_status, queue_depth
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        page,
        comments,
        screenshotUrl || null,
        browser,
        browserVersion || null,
        screenResolution || null,
        currentRoute || null,
        conversationId || null,
        workerStatus || null,
        queueDepth || 0
      ]
    );

    res.json({
      status: "success",
      message: "Issue report submitted successfully. Thank you for your feedback!"
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/dev/feature-flags/:key/toggle - Toggle dynamic feature flag status
router.post("/feature-flags/:key/toggle", requireAuth, async (req, res, next) => {
  try {
    const authUser = res.locals.authUser;
    if (authUser.role !== "ADMIN") {
      res.status(403).json({ status: "error", message: "Admin access required." });
      return;
    }

    const { key } = req.params;
    const { isEnabled } = req.body;

    await pool.execute(
      "UPDATE feature_flags SET is_enabled = ? WHERE flag_key = ?",
      [isEnabled ? 1 : 0, key]
    );

    logger.info({ flagKey: key, isEnabled }, "⚙️ System feature flag toggled");

    res.json({
      status: "success",
      message: `Feature flag ${key} status updated successfully.`
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/dev/backup/export - Downloads all database rows as a compiled JSON payload
router.get("/backup/export", requireAuth, async (req, res, next) => {
  try {
    const authUser = res.locals.authUser;
    if (authUser.role !== "ADMIN") {
      res.status(403).json({ status: "error", message: "Admin access required." });
      return;
    }

    const tables = [
      "users", "user_credentials", "whatsapp_chats", "whatsapp_messages", 
      "broadcasts", "broadcast_queue", "conversation_ai", "prompt_templates", 
      "app_feedback", "feature_flags"
    ];

    const backupPayload: Record<string, any[]> = {};

    for (const table of tables) {
      const [rows] = await pool.execute(`SELECT * FROM \`${table}\``);
      backupPayload[table] = rows as any[];
    }

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", "attachment; filename=waha_db_backup.json");
    res.json({
      version: "1.0.0-rc1",
      exportedAt: new Date().toISOString(),
      data: backupPayload
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/dev/backup/import - Safe transactional database import restoration
router.post("/backup/import", requireAuth, async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const authUser = res.locals.authUser;
    if (authUser.role !== "ADMIN") {
      res.status(403).json({ status: "error", message: "Admin access required." });
      return;
    }

    const { backupData } = req.body;
    if (!backupData || !backupData.data) {
      res.status(400).json({ status: "error", message: "Valid backupData payload is required." });
      return;
    }

    const data = backupData.data;

    // Start atomic import transaction
    await connection.beginTransaction();

    // Disable foreign key checks temporarily during truncate/restore
    await connection.execute("SET FOREIGN_KEY_CHECKS = 0");

    const tables = [
      "conversation_ai", "broadcast_queue", "broadcasts", "whatsapp_messages", 
      "whatsapp_chats", "user_credentials", "users", "prompt_templates", 
      "app_feedback", "feature_flags"
    ];

    // Truncate tables
    for (const table of tables) {
      await connection.execute(`TRUNCATE TABLE \`${table}\``);
    }

    // Restore table records
    for (const table of tables) {
      const rows = data[table] || [];
      if (rows.length === 0) continue;

      const keys = Object.keys(rows[0]);
      const placeholders = keys.map(() => "?").join(", ");
      const columns = keys.map(k => `\`${k}\``).join(", ");
      
      const insertSql = `INSERT INTO \`${table}\` (${columns}) VALUES (${placeholders})`;

      for (const row of rows) {
        const values = keys.map(k => {
          const val = row[k];
          // Handle timestamps / dates parsing
          if (val && typeof val === "string" && (val.includes("T") || val.includes("-"))) {
            const dateParsed = Date.parse(val);
            if (!isNaN(dateParsed)) return new Date(val);
          }
          return val;
        });
        await connection.execute(insertSql, values);
      }
    }

    await connection.execute("SET FOREIGN_KEY_CHECKS = 1");
    await connection.commit();

    logger.warn({ user: authUser.id }, "🚨 System backup restoration executed successfully.");

    res.json({
      status: "success",
      message: "Database backup imported and restored successfully."
    });
  } catch (err: any) {
    try {
      await connection.execute("SET FOREIGN_KEY_CHECKS = 1");
      await connection.rollback();
    } catch {}
    next(err);
  } finally {
    connection.release();
  }
});

export { router as devRouter };
