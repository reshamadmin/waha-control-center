import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import cors from "cors";
import { env } from "./config.js";
import { pool, checkDatabaseConnection } from "./db.js";

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

// Basic route
app.get("/", (req, res) => {
  res.json({ message: "Resham Sutra WAHA Control Center API V1" });
});

// Socket connection handler
io.on("connection", (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  socket.on("disconnect", () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
  });
});

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("❌ Unhandled Error:", err);
  res.status(500).json({
    status: "error",
    code: "INTERNAL_SERVER_ERROR",
    message: err.message || "Something went wrong on the server."
  });
});

// Start the server
const PORT = env.PORT;
httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 WAHA Control Center Backend running at http://localhost:${PORT}`);
});

export { app, httpServer, io };
