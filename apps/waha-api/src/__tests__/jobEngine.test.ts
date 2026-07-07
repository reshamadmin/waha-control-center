import { describe, it, expect, vi } from "vitest";

// 1. Run hoisted configurations first
vi.hoisted(() => {
  process.env.DATABASE_URL = "mysql://test:test@localhost:3306/db";
  process.env.SESSION_SECRET = "superSecretSessionKeyBypassLengthCheckConstraint";
  process.env.GEMINI_API_KEY = "dummyGeminiApiKey";
  process.env.ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
});

// 2. Mock WahaService BEFORE importing BroadcastWorker
vi.mock("../infrastructure/providers/WahaService.js", () => {
  return {
    WahaService: vi.fn().mockImplementation(() => {
      return {
        sendText: vi.fn().mockImplementation((session, phone, text) => {
          if (phone === "919999999999") {
            throw new Error("400 Contact Not Found on WhatsApp");
          }
          if (phone === "918888888888") {
            throw new Error("429 Too Many Requests Rate Limit");
          }
          if (phone === "917777777777") {
            const err: any = new Error("ECONNREFUSED Connection error");
            err.code = "ECONNREFUSED";
            throw err;
          }
          return { wahaMessageId: "mock_waha_123" };
        }),
        sendFile: vi.fn().mockResolvedValue({ wahaMessageId: "mock_waha_file_123" })
      };
    })
  };
});

// Mock database pool inside JobEngine tests
vi.mock("../infrastructure/db.js", () => {
  return {
    pool: {
      execute: vi.fn().mockResolvedValue([[{ whatsapp_session_name: "default" }], []])
    }
  };
});

import { TemplateEngine } from "../application/TemplateEngine.js";
import { BroadcastWorker } from "../application/jobs/BroadcastWorker.js";

describe("TemplateEngine Unit tests", () => {
  const engine = new TemplateEngine();

  it("successfully compiles template variables mapping", () => {
    const tmpl = "Hello {{name}}, welcome to {{village}}!";
    const variables = { name: "Kunal", village: "Gaya" };
    const res = engine.compile(tmpl, variables);
    expect(res).toBe("Hello Kunal, welcome to Gaya!");
  });

  it("validates missing template variables correctly", () => {
    const tmpl = "Hello {{name}}, welcome to {{village}}! Visit {{district}}.";
    const headers = ["phone", "name", "village"];
    const unknown = engine.validate(tmpl, headers);
    expect(unknown).toEqual(["district"]);
  });
});

describe("BroadcastWorker Process & Failure Classifications", () => {
  const worker = new BroadcastWorker();
  const mockJob = {
    id: "job_1",
    broadcast_id: "brd_1",
    phone: "919876543210",
    variables: JSON.stringify({ name: "Kunal" }),
    attempts: 0,
    worker_id: "wrk_test"
  };
  const mockCampaign = {
    user_id: "usr_admin",
    template_body: "Hi {{name}}",
    media_attachments: "[]"
  };

  it("returns sent status on successful delivery", async () => {
    const res = await worker.processJob(mockJob, mockCampaign);
    expect(res.status).toBe("sent");
    expect(res.wahaMessageId).toBe("mock_waha_123");
  });

  it("classifies invalid number exceptions as dead_letter", async () => {
    const res = await worker.processJob(
      { ...mockJob, phone: "919999999999" },
      mockCampaign
    );
    expect(res.status).toBe("dead_letter");
    expect(res.errorMessage).toContain("Contact Not Found");
  });

  it("classifies rate limit exceptions as wait state", async () => {
    const res = await worker.processJob(
      { ...mockJob, phone: "918888888888" },
      mockCampaign
    );
    expect(res.status).toBe("wait");
    expect(res.errorMessage).toContain("Rate Limit");
  });

  it("classifies network connection exceptions as failed retry state", async () => {
    const res = await worker.processJob(
      { ...mockJob, phone: "917777777777" },
      mockCampaign
    );
    expect(res.status).toBe("failed");
  });
});
