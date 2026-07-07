import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import cors from "cors";
import { env } from "./config.js";
import { checkDatabaseConnection, runMigrations } from "./db.js";
import { authRouter } from "./routes/authRoutes.js";
import { logger } from "./logger.js";

const app = express();
const httpServer = createServer(app);

// Configure Socket.IO Server
const io = new Server(httpServer, {
  cors: {
    origin: [env.PUBLIC_WEB_ORIGIN],
    credentials: true
  }
});

// Middlewares
app.use(cors({
  origin: env.PUBLIC_WEB_ORIGIN,
  credentials: true
}));
app.use(express.json());

// Routes
app.use("/api/auth", authRouter);

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

  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    database: {
      status: dbStatus,
      error: dbError
    },
    version: "1.0.0"
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
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error({ error: err.message, stack: err.stack }, "❌ Unhandled Server Error");
  res.status(err.statusCode || 500).json({
    status: "error",
    code: err.code || "INTERNAL_SERVER_ERROR",
    message: err.message || "Something went wrong on the server."
  });
});

// Start the server with dynamic DB migration checks
const PORT = env.PORT;

async function startServer() {
  try {
    if (process.env.NODE_ENV !== "test") {
      logger.info("⚙️ Initializing database migrations check...");
      await runMigrations();
      logger.info("✅ Database migration checking completed.");
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
