import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

// Run this block before Vitest hoists any imports
vi.hoisted(() => {
  process.env.DATABASE_URL = "mysql://test:test@localhost:3306/db";
  process.env.SESSION_SECRET = "superSecretSessionKeyBypassLengthCheckConstraint";
  process.env.GEMINI_API_KEY = "dummyGeminiApiKey";
  process.env.ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
});

// Mock database pool directly inside the hoisted factory
vi.mock("../infrastructure/db.js", () => {
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

  const mockBroadcastRow = {
    id: "brd_123",
    user_id: "usr_admin_default",
    title: "Seasonal Discount",
    status: "DRAFT",
    template_body: "Hi {{name}}, view code: {{code}}",
    media_attachments: "[]",
    sending_rules: "{\"randomDelayMin\":5,\"randomDelayMax\":15}",
    scheduled_at: null,
    created_at: new Date()
  };

  const mockStatRow = {
    total: 3,
    sent: 1,
    failed: 1,
    pending: 1
  };

  return {
    pool: {
      execute: vi.fn().mockImplementation(async (sql: string, params?: any[]) => {
        const query = sql.trim();
        if (query.includes("SELECT * FROM users WHERE id = ?")) {
          return [[mockAdminUser], []];
        }
        if (query.includes("SELECT whatsapp_session_name FROM user_credentials WHERE user_id = ?")) {
          return [[{ whatsapp_session_name: "default" }], []];
        }
        if (query.includes("SELECT b.id, b.user_id, b.title, b.status")) {
          return [[{
            ...mockBroadcastRow,
            total_queued: 3,
            sent_count: 1,
            failed_count: 1,
            pending_count: 1
          }], []];
        }
        if (query.includes("SELECT COUNT(id) as total,") && query.includes("FROM broadcast_queue")) {
          return [[mockStatRow], []];
        }
        if (query.includes("FROM broadcasts")) {
          return [[mockBroadcastRow], []];
        }
        return [[], []];
      }),
      getConnection: vi.fn().mockResolvedValue({
        execute: vi.fn(),
        beginTransaction: vi.fn(),
        commit: vi.fn(),
        rollback: vi.fn(),
        release: vi.fn()
      })
    },
    checkDatabaseConnection: vi.fn().mockResolvedValue(undefined),
    runMigrations: vi.fn().mockResolvedValue(undefined)
  };
});

// Mock WahaService class operations in infrastructure
vi.mock("../infrastructure/providers/WahaService.js", () => {
  return {
    WahaService: vi.fn().mockImplementation(() => {
      return {
        sendText: vi.fn().mockResolvedValue({ wahaMessageId: "waha_msg_123" }),
        sendFile: vi.fn().mockResolvedValue({ wahaMessageId: "waha_file_msg_456" })
      };
    })
  };
});

import { app } from "../server.js";
import { pool } from "../infrastructure/db.js";

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

describe("Broadcast Manager Service routes integration tests", () => {
  const adminCookie = createAuthCookie("usr_admin_default", "ADMIN", "CRM");

  beforeEach(() => {
    vi.mocked(pool.execute).mockClear();
  });

  describe("POST /api/whatsapp/broadcasts", () => {
    it("rejects campaign creations with missing title and templates", async () => {
      const res = await request(app)
        .post("/api/whatsapp/broadcasts")
        .set("Cookie", adminCookie)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("required");
    });

    it("successfully creates campaign and generates a validation report", async () => {
      const res = await request(app)
        .post("/api/whatsapp/broadcasts")
        .set("Cookie", adminCookie)
        .send({
          title: "Winter Fest Offer",
          templateBody: "Hi {{name}}, check code: {{code}}",
          mappedFields: { phoneColumn: "phone", nameColumn: "name" },
          recipients: [
            { phone: "919876543210", name: "John Doe", code: "WINT20" },
            { phone: "919876543210", name: "John Doe", code: "WINT20" }, // Duplicate
            { phone: "123", name: "Invalid Guy" }, // Invalid digits length
            { phone: "", name: "Empty Guy" } // Empty
          ]
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.broadcastId).toBeDefined();
      
      const report = res.body.validationReport;
      expect(report.totalRows).toBe(4);
      expect(report.validCount).toBe(1);
      expect(report.invalidCount).toBe(1);
      expect(report.duplicateCount).toBe(1);
      expect(report.emptyCount).toBe(1);
    });
  });

  describe("GET /api/whatsapp/broadcasts", () => {
    it("returns list of campaigns with summary sending counts", async () => {
      const res = await request(app)
        .get("/api/whatsapp/broadcasts")
        .set("Cookie", adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.broadcasts).toHaveLength(1);
      expect(res.body.broadcasts[0].total_queued).toBe(3);
    });
  });

  describe("GET /api/whatsapp/broadcasts/:id", () => {
    it("returns campaign details and calculates ETA completion", async () => {
      const res = await request(app)
        .get("/api/whatsapp/broadcasts/brd_123")
        .set("Cookie", adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.campaign.title).toBe("Seasonal Discount");
      expect(res.body.analytics.totalRecipients).toBe(3);
      expect(res.body.analytics.successPercentage).toBe(33); // 1 sent / 3 total
    });
  });

  describe("POST /api/whatsapp/broadcasts/:id/dry-run", () => {
    it("rejects dry-runs without phone preview parameters", async () => {
      const res = await request(app)
        .post("/api/whatsapp/broadcasts/brd_123/dry-run")
        .set("Cookie", adminCookie)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("preview phone");
    });

    it("successfully compiles template variables and dispatches preview", async () => {
      const res = await request(app)
        .post("/api/whatsapp/broadcasts/brd_123/dry-run")
        .set("Cookie", adminCookie)
        .send({ phone: "919876543210" });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.message).toContain("dispatched");
    });
  });

  describe("Campaign lifecycle control endpoints", () => {
    it("POST /api/whatsapp/broadcasts/:id/launch - updates status successfully", async () => {
      const res = await request(app)
        .post("/api/whatsapp/broadcasts/brd_123/launch")
        .set("Cookie", adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("success");
      expect(pool.execute).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE broadcasts SET status = ?"),
        [expect.stringContaining("RUNNING"), "brd_123", "usr_admin_default"]
      );
    });

    it("POST /api/whatsapp/broadcasts/:id/pause - updates status to PAUSED", async () => {
      const res = await request(app)
        .post("/api/whatsapp/broadcasts/brd_123/pause")
        .set("Cookie", adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("success");
    });

    it("POST /api/whatsapp/broadcasts/:id/resume - resumes execution", async () => {
      const res = await request(app)
        .post("/api/whatsapp/broadcasts/brd_123/resume")
        .set("Cookie", adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("success");
    });

    it("POST /api/whatsapp/broadcasts/:id/retry-failed - sets failed queue back to pending", async () => {
      const res = await request(app)
        .post("/api/whatsapp/broadcasts/brd_123/retry-failed")
        .set("Cookie", adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("success");
    });
  });
});
