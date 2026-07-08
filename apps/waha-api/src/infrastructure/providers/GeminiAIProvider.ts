import axios from "axios";
import crypto from "node:crypto";
import { AIProvider } from "../../domain/AIProvider.js";
import { env } from "../config.js";
import { pool } from "../db.js";
import { logger } from "../logger.js";

export class GeminiAIProvider implements AIProvider {
  private apiKey = env.GEMINI_API_KEY;
  private baseUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

  async analyzeText(prompt: string, requestType = "analyze"): Promise<string> {
    const startTime = Date.now();
    
    try {
      if (!this.apiKey || this.apiKey.includes("your_gemini")) {
        throw new Error("GEMINI_API_KEY is not configured or holds default placeholder value.");
      }

      const response = await axios.post(
        `${this.baseUrl}?key=${this.apiKey}`,
        {
          contents: [{
            parts: [{ text: prompt }]
          }]
        },
        { timeout: 15000 }
      );

      const generatedText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const latency = Date.now() - startTime;

      // Refinement 6: Usage metrics & latency tracking
      const promptTokens = Math.ceil(prompt.length / 4);
      const completionTokens = Math.ceil(generatedText.length / 4);
      // Cost: Input $0.075 / 1M, Output $0.30 / 1M
      const cost = (promptTokens * 0.000000075) + (completionTokens * 0.0000003);

      await this.logUsage(requestType, promptTokens, completionTokens, latency, cost);

      return generatedText;
    } catch (err: any) {
      const latency = Date.now() - startTime;
      logger.error({ error: err.message, requestType }, "❌ Gemini AI Provider execution failed");
      
      // Log failed request details too with 0 tokens
      const logId = `log_${crypto.randomUUID()}`;
      try {
        await pool.execute(
          `INSERT INTO system_logs (id, level, source, message, stack) 
           VALUES (?, 'ERROR', 'AI', ?, ?)`,
          [logId, `Gemini AI Provider execution failed: ${err.message}`, err.stack || null]
        );
      } catch {}
      await this.logUsage(requestType, 0, 0, latency, 0.0);
      throw err;
    }
  }

  async generateSuggestedReply(chatHistory: string): Promise<string> {
    return this.analyzeText(chatHistory, "reply");
  }

  private async logUsage(
    requestType: string,
    promptTokens: number,
    completionTokens: number,
    latencyMs: number,
    cost: number
  ) {
    try {
      const id = `usg_${crypto.randomUUID()}`;
      await pool.execute(
        `INSERT INTO ai_usage (id, request_type, prompt_tokens, completion_tokens, latency_ms, estimated_cost)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, requestType, promptTokens, completionTokens, latencyMs, cost]
      );
    } catch (err: any) {
      logger.warn({ error: err.message }, "⚠️ Failed to log AI usage metrics to database");
    }
  }
}
