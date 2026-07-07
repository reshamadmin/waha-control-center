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

  const mockChatRow = {
    id: "cht_123",
    user_id: "usr_admin_default",
    customer_id: null,
    waha_chat_id: "919876543210@c.us",
    contact_phone: "919876543210",
    contact_name: "John Doe",
    last_message_at: new Date(),
    last_message_preview: "Hello there",
    unread_count: 2
  };

  const mockMessageRow = {
    id: "msg_1",
    chat_id: "cht_123",
    user_id: "usr_admin_default",
    direction: "inbound",
    waha_message_id: "waha_msg_1",
    message_type: "text",
    body: "Hello there",
    media_url: null,
    status: "read",
    sent_at: new Date()
  };

  return {
    pool: {
      execute: vi.fn().mockImplementation(async (sql: string, params?: any[]) => {
        const query = sql.trim();
        if (query.includes("SELECT * FROM users WHERE id = ?")) {
          const id = params?.[0];
          if (id === "usr_admin_default") return [[mockAdminUser], []];
          if (id === "usr_normal_default") return [[mockNormalUser], []];
        }
        if (query.includes("SELECT whatsapp_session_name FROM user_credentials WHERE user_id = ?")) {
          return [[{ whatsapp_session_name: "default" }], []];
        }
        if (query.includes("SELECT user_id FROM user_credentials WHERE whatsapp_session_name = ?")) {
          return [[{ user_id: "usr_admin_default" }], []];
        }
        if (query.includes("SELECT id, unread_count FROM whatsapp_chats WHERE user_id = ? AND waha_chat_id = ?")) {
          return [[], []]; // Return empty so a new chat is created in sync webhook tests
        }
        if (query.includes("SELECT DISTINCT c.id, c.user_id, c.customer_id, c.waha_chat_id")) {
          return [[mockChatRow], []];
        }
        if (query.includes("SELECT id, chat_id, user_id, direction, waha_message_id")) {
          return [[mockMessageRow], []];
        }
        if (query.includes("SELECT contact_phone FROM whatsapp_chats WHERE id = ? AND user_id = ?")) {
          return [[mockChatRow], []];
        }
        return [[], []];
      }),
      getConnection: vi.fn()
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
        getSessionStatus: vi.fn().mockResolvedValue("SCAN_QR"),
        startSession: vi.fn().mockResolvedValue(undefined),
        stopSession: vi.fn().mockResolvedValue(undefined),
        getQrCode: vi.fn().mockResolvedValue("data:image/png;base64,mockqr"),
        sendText: vi.fn().mockResolvedValue({ wahaMessageId: "waha_msg_123" }),
        syncSessionStatusToDb: vi.fn().mockResolvedValue(undefined)
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

describe("WhatsApp Service Transport endpoints & Webhook Receiver tests", () => {
  const adminCookie = createAuthCookie("usr_admin_default", "ADMIN", "CRM");
  const userCookie = createAuthCookie("usr_normal_default", "USER", "CRM");

  beforeEach(() => {
    vi.mocked(pool.execute).mockClear();
  });

  describe("GET /api/whatsapp/status", () => {
    it("returns 401 Unauthorized for missing auth sessions", async () => {
      const res = await request(app).get("/api/whatsapp/status");
      expect(res.status).toBe(401);
    });

    it("returns session status payload for authenticated admin user", async () => {
      const res = await request(app)
        .get("/api/whatsapp/status")
        .set("Cookie", adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.session.name).toBe("default");
      expect(res.body.session.status).toBe("SCAN_QR");
    });
  });

  describe("GET /api/whatsapp/qr", () => {
    it("returns base64 QR Data URI payload if session status requires it", async () => {
      const res = await request(app)
        .get("/api/whatsapp/qr")
        .set("Cookie", adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("SCAN_QR");
      expect(res.body.qrCode).toContain("data:image/png;base64,");
    });
  });

  describe("POST /api/whatsapp/disconnect", () => {
    it("returns 403 Forbidden for non-admin role users", async () => {
      const res = await request(app)
        .post("/api/whatsapp/disconnect")
        .set("Cookie", userCookie);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FORBIDDEN");
    });

    it("returns 200 success disconnect response for admin users", async () => {
      const res = await request(app)
        .post("/api/whatsapp/disconnect")
        .set("Cookie", adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.message).toContain("disconnected");
    });
  });

  describe("POST /api/whatsapp/restart", () => {
    it("returns 403 Forbidden for non-admin role users", async () => {
      const res = await request(app)
        .post("/api/whatsapp/restart")
        .set("Cookie", userCookie);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FORBIDDEN");
    });

    it("returns 200 success restart response for admin users", async () => {
      const res = await request(app)
        .post("/api/whatsapp/restart")
        .set("Cookie", adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.message).toContain("restarted");
    });
  });

  describe("POST /api/webhooks/waha", () => {
    it("successfully logs raw events and updates DB credentials on session.status updates", async () => {
      const res = await request(app)
        .post("/api/webhooks/waha")
        .send({
          event: "session.status",
          payload: {
            session: "default",
            status: "CONNECTED"
          }
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("success");

      // Verify DB updates were triggered
      expect(pool.execute).toHaveBeenCalled();
    });

    it("successfully creates contact/message synchronizations on incoming message webhooks", async () => {
      const res = await request(app)
        .post("/api/webhooks/waha")
        .send({
          event: "message",
          payload: {
            session: "default",
            id: "msg_waha_test_123",
            body: "Hello from customer",
            from: "919876543210@c.us",
            to: "919988776655@c.us",
            fromMe: false,
            timestamp: 1672531199,
            sender: {
              name: "John Doe"
            }
          }
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("success");
      
      // Verify chat thread creation and message archiving queries were run
      expect(pool.execute).toHaveBeenCalled();
    });
  });

  describe("CRM Inbox Endpoints (Chats, Messages, & Mark Read)", () => {
    it("GET /api/whatsapp/chats - retrieves paginated chat feeds", async () => {
      const res = await request(app)
        .get("/api/whatsapp/chats")
        .set("Cookie", adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.chats).toHaveLength(1);
      expect(res.body.chats[0].contact_name).toBe("John Doe");
    });

    it("GET /api/whatsapp/chats/:chatId/messages - retrieves paginated historical message logs", async () => {
      const res = await request(app)
        .get("/api/whatsapp/chats/cht_123/messages")
        .set("Cookie", adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.messages).toHaveLength(1);
      expect(res.body.messages[0].body).toBe("Hello there");
    });

    it("POST /api/whatsapp/chats/:chatId/read - resets the unread count marker", async () => {
      const res = await request(app)
        .post("/api/whatsapp/chats/cht_123/read")
        .set("Cookie", adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.message).toContain("marked as read");
      expect(pool.execute).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE whatsapp_chats SET unread_count = 0"),
        ["cht_123", "usr_admin_default"]
      );
    });

    it("POST /api/whatsapp/messages - rejects outbound texts with missing body", async () => {
      const res = await request(app)
        .post("/api/whatsapp/messages")
        .set("Cookie", adminCookie)
        .send({ chatId: "cht_123" });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("required");
    });

    it("POST /api/whatsapp/messages - executes dispatch, registers to DB, and broadcasts event", async () => {
      const res = await request(app)
        .post("/api/whatsapp/messages")
        .set("Cookie", adminCookie)
        .send({ chatId: "cht_123", body: "Sending test reply" });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.message.body).toBe("Sending test reply");
      
      expect(pool.execute).toHaveBeenCalled();
    });
  });
});
