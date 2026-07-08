import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../infrastructure/config.js";
import { checkDatabaseConnection, runMigrations, pool } from "../infrastructure/db.js";
import { authRouter } from "./routes/authRoutes.js";
import { whatsappRouter } from "./routes/whatsappRoutes.js";
import { webhookRouter } from "./routes/webhookRoutes.js";
import { broadcastRouter } from "./routes/broadcastRoutes.js";
import { aiRouter } from "./routes/aiRoutes.js";
import { devRouter } from "./routes/devRoutes.js";
import { logger } from "../infrastructure/logger.js";
import { JobEngine } from "../application/jobs/JobEngine.js";
import crypto from "node:crypto";
import { WahaService } from "../infrastructure/providers/WahaService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);

// Configure Socket.IO Server
const io = new Server(httpServer, {
  cors: {
    origin: [env.PUBLIC_WEB_ORIGIN],
    credentials: true
  }
});

export const jobEngine = new JobEngine();
const wahaService = new WahaService();

// Middlewares
app.use(cors({
  origin: env.PUBLIC_WEB_ORIGIN,
  credentials: true
}));
app.use(express.json());

// Request correlation ID and structured logger middleware
app.use((req, res, next) => {
  const requestId = req.headers["x-request-id"] || crypto.randomUUID();
  const correlationId = req.headers["x-correlation-id"] || requestId;
  res.locals.requestId = requestId;
  res.locals.correlationId = correlationId;
  next();
});

// Expose public uploads folder statically
app.use("/uploads", express.static(path.resolve(__dirname, "../../../../public/uploads")));

// Routes
app.use("/api/auth", authRouter);
app.use("/api/whatsapp/broadcasts", broadcastRouter);
app.use("/api/whatsapp", whatsappRouter);
app.use("/api/webhooks", webhookRouter);
app.use("/api/ai", aiRouter);
app.use("/api/dev", devRouter);

// Health check endpoint
app.get("/health", async (req, res) => {
  let dbStatus = "disconnected";
  let dbError = null;

  try {
    await checkDatabaseConnection();
    dbStatus = "connected";
  } catch (err: any) {
    dbError = err.message;
  }

  let wahaStatus = "disconnected";
  try {
    const status = await wahaService.getSessionStatus("default");
    if (status === "CONNECTED") {
      wahaStatus = "connected";
    }
  } catch {}

  const storageStatus = "connected";
  const geminiStatus = env.GEMINI_API_KEY ? "connected" : "disconnected";

  res.json({
    status: dbStatus === "connected" ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
    components: {
      API: "connected",
      MySQL: dbStatus,
      WAHA: wahaStatus,
      Gemini: geminiStatus,
      Storage: storageStatus,
      JobEngine: "connected",
      SocketIO: io.sockets.sockets.size > 0 ? "active" : "inactive"
    },
    version: "1.0.0-rc1"
  });
});

// Basic identity route
app.get("/", (req, res) => {
  res.json({ message: "Resham Sutra WAHA Control Center API V1" });
});

// Socket connection handler
io.on("connection", (socket) => {
  logger.info({ socketId: socket.id }, "🔌 Client connected to Socket.IO");

  socket.on("disconnect", () => {
    logger.info({ socketId: socket.id }, "🔌 Client disconnected from Socket.IO");
  });
});

// Global Error Handler
app.use(async (err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error({ error: err.message, stack: err.stack }, "❌ Unhandled Server Error");

  try {
    const id = `log_${crypto.randomUUID()}`;
    const requestId = res.locals.requestId || null;
    const user = res.locals.authUser?.id || null;
    await pool.execute(
      `INSERT INTO system_logs (id, level, source, request_id, user_id, endpoint, message, stack)
       VALUES (?, 'ERROR', 'API', ?, ?, ?, ?, ?)`,
      [id, requestId, user, req.originalUrl || req.url, err.message || "Unknown error", err.stack || null]
    );
  } catch (logErr: any) {
    logger.warn({ error: logErr.message }, "⚠️ Failed to save unhandled exception to system_logs table");
  }

  res.status(err.statusCode || 500).json({
    status: "error",
    code: err.code || "INTERNAL_SERVER_ERROR",
    message: err.message || "Something went wrong on the server."
  });
});

const PORT = env.PORT;

export async function startServer() {
  try {
    if (process.env.NODE_ENV !== "test") {
      logger.info("⚙️ Initializing database migrations check...");
      await runMigrations();
      logger.info("✅ Database migration checking completed.");

      logger.info("⚙️ Booting background Job Engine...");
      jobEngine.start();
    }
  } catch (err) {
    logger.error({ error: err }, "⚠️ Failed to apply migrations during startup, proceeding with boot");
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    logger.info({ port: PORT }, "🚀 WAHA Control Center Backend running");
  });
}

// Automatically start if not loaded under tests
if (process.env.NODE_ENV !== "test") {
  startServer();
}

export { app, httpServer, io };
