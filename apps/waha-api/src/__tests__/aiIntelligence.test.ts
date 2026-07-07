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
import { aiRouter } from "../presentation/routes/aiRoutes.js";

// Mock the requireAuth middleware to bypass JWT validation
vi.mock("../application/auth.js", () => {
  return {
    requireAuth: (req: any, res: any, next: any) => {
      res.locals.authUser = { id: "usr_admin", name: "Resham Sutra Admin", role: "ADMIN" };
      next();
    }
  };
});

// Mock GeminiAIProvider inside integration tests
vi.mock("../infrastructure/providers/GeminiAIProvider.js", () => {
  return {
    GeminiAIProvider: vi.fn().mockImplementation(() => {
      return {
        analyzeText: vi.fn().mockResolvedValue(
          JSON.stringify({
            professional: "Dear Customer, thank you.",
            friendly: "Hi there! Thanks!",
            short: "Thanks!",
            detailed: "Hello. We appreciate your contact."
          })
        )
      };
    })
  };
});

// Mock Database Pool
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

import { pool } from "../infrastructure/db.js";

const app = express();
app.use(express.json());
app.use("/api/ai", aiRouter);

describe("AI Conversation Intelligence Routes Integration Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET /api/ai/analyze/:chatId returns structured intelligence details", async () => {
    // Mock existing db record
    const mockRecord = {
      summary: "Customer needs catalog.",
      intent: "catalog",
      priority: "MEDIUM",
      sentiment: "POSITIVE",
      language: "Hindi",
      action_required: 1,
      follow_up_date: "2026-07-10",
      product_interest: "Eri Silk Machine",
      government_opportunity: 0,
      funding_opportunity: 1,
      decision_maker: "Kunal",
      important_numbers: JSON.stringify(["919999999999"]),
      keywords: JSON.stringify(["silk", "catalog"]),
      knowledge_facts: JSON.stringify(["needs quote"])
    };
    vi.mocked(pool.execute).mockResolvedValueOnce([[mockRecord] as any, [] as any]);

    const res = await request(app).get("/api/ai/analyze/cht_123");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.intelligence.summary).toBe("Customer needs catalog.");
    expect(res.body.intelligence.productInterest).toBe("Eri Silk Machine");
    expect(res.body.intelligence.importantNumbers).toEqual(["919999999999"]);
  });

  it("POST /api/ai/analyze enqueues a background AI task", async () => {
    const res = await request(app)
      .post("/api/ai/analyze")
      .send({ chatId: "cht_123" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.message).toContain("enqueued");
    expect(pool.execute).toHaveBeenCalled();
  });

  it("POST /api/ai/reply generates suggested replies in 4 tones", async () => {
    // Mock last 20 messages fetch and prompt fetch
    vi.mocked(pool.execute)
      .mockResolvedValueOnce([[{ direction: "inbound", bodyText: "Send catalog" }] as any, [] as any]) // messages
      .mockResolvedValueOnce([[{ prompt_body: "Suggest replies" }] as any, [] as any]); // prompt template

    const res = await request(app)
      .post("/api/ai/reply")
      .send({ chatId: "cht_123" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.replies.professional).toContain("Dear Customer");
    expect(res.body.replies.friendly).toContain("Hi there");
  });

  it("POST /api/ai/feedback records 👍/👎 agent feedback reviews", async () => {
    const res = await request(app)
      .post("/api/ai/feedback")
      .send({
        chatId: "cht_123",
        promptKey: "REPLY",
        generatedText: "Hi there!",
        feedbackType: "LIKE",
        comment: "Great response"
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.message).toContain("Feedback submitted");
  });

  it("GET /api/ai/prompts retrieves Prompt templates library", async () => {
    vi.mocked(pool.execute).mockResolvedValueOnce([
      [
        { id: "1", prompt_key: "SUMMARY", title: "Summary Prompt", prompt_body: "Body" }
      ] as any,
      [] as any
    ]);

    const res = await request(app).get("/api/ai/prompts");
    expect(res.status).toBe(200);
    expect(res.body.prompts.length).toBe(1);
  });

  it("POST /api/ai/prompts/test simulates raw playpen prompt testing", async () => {
    const res = await request(app)
      .post("/api/ai/prompts/test")
      .send({ promptText: "Translate", testInput: "Hello" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.output).toBeDefined();
  });

  it("GET /api/ai/usage returns token costs report stats", async () => {
    vi.mocked(pool.execute)
      .mockResolvedValueOnce([[{ date: "2026-07-07", total_requests: 10, total_cost: 0.05 }] as any, [] as any]) // daily
      .mockResolvedValueOnce([[{ month: "2026-07", total_requests: 100, total_cost: 0.50 }] as any, [] as any]); // monthly

    const res = await request(app).get("/api/ai/usage");
    expect(res.status).toBe(200);
    expect(res.body.usage.daily.length).toBe(1);
    expect(res.body.usage.monthly.length).toBe(1);
  });
});
