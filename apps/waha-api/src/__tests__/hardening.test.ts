import { describe, it, expect, vi, beforeEach } from "vitest";

// Run this block before Vitest hoists any imports
vi.hoisted(() => {
  process.env.DATABASE_URL = "mysql://test:test@localhost:3306/db";
  process.env.SESSION_SECRET = "superSecretSessionKeyBypassLengthCheckConstraint";
  process.env.GEMINI_API_KEY = "dummyGeminiApiKey";
  process.env.ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
});

import request from "supertest";
import express from "express";
import { devRouter } from "../presentation/routes/devRoutes.js";

// Mock auth middleware
vi.mock("../application/auth.js", () => {
  return {
    requireAuth: (req: any, res: any, next: any) => {
      res.locals.authUser = { id: "usr_admin", name: "Resham Sutra Admin", role: "ADMIN" };
      next();
    }
  };
});

// Mock database pool
vi.mock("../infrastructure/db.js", () => {
  const mockExec = vi.fn().mockResolvedValue([[], []]);
  return {
    pool: {
      execute: mockExec,
      getConnection: vi.fn().mockResolvedValue({
        beginTransaction: vi.fn(),
        commit: vi.fn(),
        rollback: vi.fn(),
        release: vi.fn(),
        execute: mockExec
      })
    }
  };
});

// Mock WAHA Service
vi.mock("../infrastructure/providers/WahaService.js", () => {
  return {
    WahaService: vi.fn().mockImplementation(() => {
      return {
        getSessions: vi.fn().mockResolvedValue([{ name: "default", status: "CONNECTED" }])
      };
    })
  };
});

// Mock Server JobEngine instance metrics
vi.mock("../presentation/server.js", () => {
  return {
    jobEngine: {
      getMetrics: vi.fn().mockReturnValue({
        messages_sent: 10,
        messages_failed: 1,
        average_send_time_ms: 1000,
        average_retry_attempts: 1,
        queue_depth: 0,
        worker_uptime: "1h 10m"
      })
    }
  };
});

import { pool } from "../infrastructure/db.js";

const app = express();
app.use(express.json());
// Bind res.locals for correlation testing
app.use((req, res, next) => {
  res.locals.requestId = "mock_req_123";
  next();
});
app.use("/api/dev", devRouter);

describe("Staging Hardening Dev Routes Integration Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET /api/dev/diagnostics returns logs, metrics, and feature flags", async () => {
    vi.mocked(pool.execute)
      .mockResolvedValueOnce([[{ id: "log_1", level: "INFO", message: "Worker up" }] as any, [] as any]) // logs
      .mockResolvedValueOnce([[{ id: "mtr_1", avg_latency_ms: 800 }] as any, [] as any]) // metrics history
      .mockResolvedValueOnce([[{ flag_key: "AI_ENABLED", is_enabled: 1 }] as any, [] as any]); // feature flags

    const res = await request(app).get("/api/dev/diagnostics");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.diagnostics.release.appVersion).toBe("1.0.0-rc1");
    expect(res.body.diagnostics.logs[0].message).toBe("Worker up");
  });

  it("POST /api/dev/feedback inserts issue reports successfully", async () => {
    const res = await request(app)
      .post("/api/dev/feedback")
      .send({
        page: "Inbox",
        comments: "Infinite scroll failed",
        browser: "Chrome v120"
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.message).toContain("submitted");
    expect(pool.execute).toHaveBeenCalled();
  });

  it("POST /api/dev/feature-flags/:key/toggle toggles database parameters", async () => {
    const res = await request(app)
      .post("/api/dev/feature-flags/AI_ENABLED/toggle")
      .send({ isEnabled: false });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.message).toContain("updated");
  });

  it("GET /api/dev/backup/export creates valid table JSON downloads", async () => {
    vi.mocked(pool.execute).mockResolvedValue([[{ id: "rec_1" }] as any, [] as any]);

    const res = await request(app).get("/api/dev/backup/export");
    expect(res.status).toBe(200);
    expect(res.header["content-type"]).toContain("json");
    expect(res.body.data.users).toBeDefined();
  });

  it("POST /api/dev/backup/import runs database truncation and restoration", async () => {
    const mockBackupPayload = {
      version: "1.0.0-rc1",
      data: {
        users: [{ id: "usr_admin", name: "Seeded Admin" }],
        feature_flags: [{ id: "ff_ai", flag_key: "AI_ENABLED", flag_name: "AI", is_enabled: 1 }]
      }
    };

    const res = await request(app)
      .post("/api/dev/backup/import")
      .send({ backupData: mockBackupPayload });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.message).toContain("restored");
  });
});
