import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

// Run this block before Vitest hoists any imports
vi.hoisted(() => {
  process.env.DATABASE_URL = "mysql://test:test@localhost:3306/db";
  process.env.SESSION_SECRET = "superSecretSessionKeyBypassLengthCheckConstraint";
  process.env.GEMINI_API_KEY = "dummyGeminiApiKey";
  process.env.ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
});

// Setup mock user entries
const mockAdminUser = {
  id: "usr_admin_default",
  name: "Resham Sutra Admin",
  email: "admin@reshamsutra.com",
  password_hash: "$2b$10$5jhdPgWK9jUPI9Zyp.fKSuxuydwwEKamM0ywPRR4OcuzsbGzerYyS",
  role: "ADMIN",
  default_persona: "CRM",
  created_at: new Date(),
  updated_at: new Date()
};

const mockNormalUser = {
  id: "usr_normal_default",
  name: "Resham Sutra User",
  email: "user@reshamsutra.com",
  password_hash: "$2b$10$5jhdPgWK9jUPI9Zyp.fKSuxuydwwEKamM0ywPRR4OcuzsbGzerYyS",
  role: "USER",
  default_persona: "CRM",
  created_at: new Date(),
  updated_at: new Date()
};

// Mock database pool
vi.mock("../db.js", () => {
  return {
    pool: {
      execute: vi.fn().mockImplementation(async (sql: string, params?: any[]) => {
        const query = sql.trim();
        // User lookups
        if (query.includes("SELECT * FROM users WHERE id = ?")) {
          const id = params?.[0];
          if (id === "usr_admin_default") return [[mockAdminUser], []];
          if (id === "usr_normal_default") return [[mockNormalUser], []];
        }
        // Credentials lookup
        if (query.includes("SELECT whatsapp_session_name FROM user_credentials WHERE user_id = ?")) {
          return [[{ whatsapp_session_name: "default" }], []];
        }
        return [[], []];
      }),
      getConnection: vi.fn()
    },
    checkDatabaseConnection: vi.fn().mockResolvedValue(undefined),
    runMigrations: vi.fn().mockResolvedValue(undefined)
  };
});

// Mock WahaService class operations
vi.mock("../services/WahaService.js", () => {
  return {
    WahaService: vi.fn().mockImplementation(() => {
      return {
        getSessionStatus: vi.fn().mockResolvedValue("SCAN_QR"),
        startSession: vi.fn().mockResolvedValue(undefined),
        stopSession: vi.fn().mockResolvedValue(undefined),
        getQrCode: vi.fn().mockResolvedValue("mock_qr_data_123"),
        syncSessionStatusToDb: vi.fn().mockResolvedValue(undefined)
      };
    })
  };
});

import { app } from "../server.js";

// Helper to generate cookies for requests
function createAuthCookie(userId: string, role: string, persona: string): string {
  const token = jwt.sign(
    {
      sub: userId,
      name: "Test Name",
      email: "test@test.com",
      role,
      defaultPersona: persona
    },
    process.env.SESSION_SECRET || "superSecretSessionKeyBypassLengthCheckConstraint",
    { expiresIn: "1h" }
  );
  return `session_token=${token}`;
}

describe("WhatsApp Settings & Session Controller integration tests", () => {
  const adminCookie = createAuthCookie("usr_admin_default", "ADMIN", "CRM");
  const userCookie = createAuthCookie("usr_normal_default", "USER", "CRM");

  describe("GET /api/settings/whatsapp/status", () => {
    it("returns 401 Unauthorized for missing auth sessions", async () => {
      const res = await request(app).get("/api/settings/whatsapp/status");
      expect(res.status).toBe(401);
    });

    it("returns session status payload for authenticated admin user", async () => {
      const res = await request(app)
        .get("/api/settings/whatsapp/status")
        .set("Cookie", adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.session.name).toBe("default");
      expect(res.body.session.status).toBe("SCAN_QR");
    });
  });

  describe("GET /api/settings/whatsapp/qr", () => {
    it("returns QR code data payload if session status requires it", async () => {
      const res = await request(app)
        .get("/api/settings/whatsapp/qr")
        .set("Cookie", adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("SCAN_QR");
      expect(res.body.qrCode).toBe("mock_qr_data_123");
    });
  });

  describe("POST /api/settings/whatsapp/disconnect", () => {
    it("returns 403 Forbidden for non-admin role users", async () => {
      const res = await request(app)
        .post("/api/settings/whatsapp/disconnect")
        .set("Cookie", userCookie);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FORBIDDEN");
    });

    it("returns 200 success disconnect response for admin users", async () => {
      const res = await request(app)
        .post("/api/settings/whatsapp/disconnect")
        .set("Cookie", adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.message).toContain("disconnected");
    });
  });

  describe("POST /api/settings/whatsapp/restart", () => {
    it("returns 403 Forbidden for non-admin role users", async () => {
      const res = await request(app)
        .post("/api/settings/whatsapp/restart")
        .set("Cookie", userCookie);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FORBIDDEN");
    });

    it("returns 200 success restart response for admin users", async () => {
      const res = await request(app)
        .post("/api/settings/whatsapp/restart")
        .set("Cookie", adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.message).toContain("restarted");
    });
  });
});
