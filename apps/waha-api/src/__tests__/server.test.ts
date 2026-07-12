import { describe, it, expect, vi } from "vitest";
import request from "supertest";

// Run this block before any module imports are hoisted/executed by Vitest
vi.hoisted(() => {
  process.env.DATABASE_URL = "mysql://test:test@localhost:3306/db";
  process.env.SESSION_SECRET = "superSecretSessionKeyBypassLengthCheckConstraint";
  process.env.GEMINI_API_KEY = "dummyGeminiApiKey";
  process.env.ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "dummySupabaseKey";
});

// Mock the database pool and connection module in infrastructure
vi.mock("../infrastructure/db.js", () => ({
  pool: {
    execute: vi.fn(),
    getConnection: vi.fn()
  },
  checkDatabaseConnection: vi.fn().mockResolvedValue(undefined)
}));

vi.mock("../infrastructure/repositories/UserRepository.js", () => {
  return {
    UserRepository: vi.fn().mockImplementation(() => {
      return {
        findByEmail: vi.fn().mockResolvedValue(null),
        findById: vi.fn().mockResolvedValue(null)
      };
    })
  };
});

// Now safely import the server app
import { app } from "../server.js";

describe("Express Server Standalone Workspace tests", () => {
  it("GET / should return API identity welcome properties", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.body.message).toContain("Resham Sutra WAHA Control Center API V1");
  });

  it("GET /health should report database status connected", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("healthy");
    expect(res.body.components.API).toBe("connected");
    expect(res.body.components.MySQL).toBe("connected");
  });
});
