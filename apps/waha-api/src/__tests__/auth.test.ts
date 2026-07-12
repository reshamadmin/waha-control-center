import { describe, it, expect, vi } from "vitest";
import request from "supertest";

// Run this block before Vitest hoists any imports
vi.hoisted(() => {
  process.env.DATABASE_URL = "mysql://test:test@localhost:3306/db";
  process.env.SESSION_SECRET = "superSecretSessionKeyBypassLengthCheckConstraint";
  process.env.GEMINI_API_KEY = "dummyGeminiApiKey";
  process.env.ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "dummySupabaseKey";
});

// Mock database pool executions directly
vi.mock("../infrastructure/db.js", () => {
  const mockUserRow = {
    id: "usr_admin_default",
    name: "Resham Sutra Admin",
    email: "admin@reshamsutra.com",
    password_hash: "$2b$10$5jhdPgWK9jUPI9Zyp.fKSuxuydwwEKamM0ywPRR4OcuzsbGzerYyS", // Correct Bcrypt hash of 'admin123'
    role: "ADMIN",
    default_persona: "CRM",
    created_at: new Date(),
    updated_at: new Date()
  };

  return {
    pool: {
      execute: vi.fn().mockImplementation(async (sql: string, params?: any[]) => {
        const query = sql.trim();
        if (query.includes("SELECT * FROM users WHERE email = ?")) {
          const email = params?.[0];
          if (email === "admin@reshamsutra.com") {
            return [[mockUserRow], []];
          }
          return [[], []];
        }
        if (query.includes("SELECT * FROM users WHERE id = ?")) {
          const id = params?.[0];
          if (id === "usr_admin_default") {
            return [[mockUserRow], []];
          }
          return [[], []];
        }
        return [[], []];
      }),
      getConnection: vi.fn()
    },
    checkDatabaseConnection: vi.fn().mockResolvedValue(undefined),
    runMigrations: vi.fn().mockResolvedValue(undefined)
  };
});

vi.mock("../infrastructure/repositories/UserRepository.js", () => {
  return {
    UserRepository: vi.fn().mockImplementation(() => {
      const mockUserRow = {
        id: "usr_admin_default",
        name: "Resham Sutra Admin",
        email: "admin@reshamsutra.com",
        passwordHash: "$2b$10$5jhdPgWK9jUPI9Zyp.fKSuxuydwwEKamM0ywPRR4OcuzsbGzerYyS", // Correct Bcrypt hash of 'admin123'
        role: "ADMIN",
        defaultPersona: "CRM",
        createdAt: new Date(),
        updatedAt: new Date()
      };
      return {
        findByEmail: vi.fn().mockImplementation(async (email: string) => {
          if (email === "admin@reshamsutra.com") return mockUserRow;
          return null;
        }),
        findById: vi.fn().mockImplementation(async (id: string) => {
          if (id === "usr_admin_default") return mockUserRow;
          return null;
        })
      };
    })
  };
});

import { app } from "../server.js";
import { hashPassword, verifyPassword } from "../application/auth.js";

import crypto from "node:crypto";
import bcryptjs from "bcryptjs";

describe("Authentication Services & Routes integration tests", () => {
  describe("Password Hashing Functions", () => {
    it("successfully hashes and verifies passwords using timing-safe comparisons", async () => {
      const password = "mySecurePassword123";
      const hash = await hashPassword(password);
      
      expect(await verifyPassword(password, hash)).toBe(true);
      expect(await verifyPassword("differentPassword", hash)).toBe(false);
    });

    it("successfully verifies legacy raw SHA-256 hashes", async () => {
      const password = "legacyPassword123";
      const rawSha256 = crypto.createHash("sha256").update(password).digest("hex");

      expect(await verifyPassword(password, rawSha256)).toBe(true);
      expect(await verifyPassword("differentPassword", rawSha256)).toBe(false);
    });

    it("successfully verifies legacy SHA-256 hashes upgraded to bcrypt", async () => {
      const password = "upgradedPassword123";
      const rawSha256 = crypto.createHash("sha256").update(password).digest("hex");
      const bcryptOfSha256 = await bcryptjs.hash(rawSha256, 10);

      expect(await verifyPassword(password, bcryptOfSha256)).toBe(true);
      expect(await verifyPassword("differentPassword", bcryptOfSha256)).toBe(false);
    });
  });

  describe("API Authentication Routes", () => {
    it("POST /api/auth/login - rejects invalid credentials", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "admin@reshamsutra.com", password: "wrongPassword" });

      expect(res.status).toBe(401);
      expect(res.body.status).toBe("error");
      expect(res.body.message).toContain("Invalid email or password");
    });

    it("POST /api/auth/login - accepts valid credentials and assigns cookie", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "admin@reshamsutra.com", password: "admin123" });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.user.email).toBe("admin@reshamsutra.com");
      
      const cookies = res.headers["set-cookie"];
      expect(cookies).toBeDefined();
      expect(cookies[0]).toContain("session_token");
    });

    it("GET /api/auth/me - returns unauthorized for missing sessions", async () => {
      const res = await request(app).get("/api/auth/me");
      expect(res.status).toBe(401);
      expect(res.body.code).toBe("UNAUTHORIZED");
    });

    it("GET /api/auth/me - returns active profile for verified cookie sessions", async () => {
      const loginRes = await request(app)
        .post("/api/auth/login")
        .send({ email: "admin@reshamsutra.com", password: "admin123" });
      
      const cookie = loginRes.headers["set-cookie"][0].split(";")[0];

      const meRes = await request(app)
        .get("/api/auth/me")
        .set("Cookie", cookie);

      expect(meRes.status).toBe(200);
      expect(meRes.body.status).toBe("success");
      expect(meRes.body.user.id).toBe("usr_admin_default");
    });

    it("POST /api/auth/logout - clears authentication cookie", async () => {
      const res = await request(app).post("/api/auth/logout");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("success");
      
      const cookie = res.headers["set-cookie"][0];
      expect(cookie).toContain("session_token=");
      expect(cookie).toContain("1970"); // Expired flag date check
    });
  });
});
