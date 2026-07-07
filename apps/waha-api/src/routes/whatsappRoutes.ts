import { Router } from "express";
import { requireAuth } from "../auth.js";
import { WahaService } from "../services/WahaService.js";
import { pool } from "../db.js";
import { logger } from "../logger.js";

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

// GET /whatsapp/status - Retrieves session status and updates DB
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

// GET /whatsapp/qr - Retrieves QR code base64 Data URI
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

// POST /whatsapp/disconnect - Disconnects WAHA session (Admin only)
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

// POST /whatsapp/restart - Restarts WAHA session (Admin only)
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

export { router as whatsappRouter };
