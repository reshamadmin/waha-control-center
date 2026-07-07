import { pool } from "../../infrastructure/db.js";
import { WahaService } from "../../infrastructure/providers/WahaService.js";
import { TemplateEngine } from "../TemplateEngine.js";
import { logger } from "../../infrastructure/logger.js";

export interface JobProcessResult {
  status: "sent" | "failed" | "dead_letter" | "wait";
  wahaMessageId?: string;
  errorMessage?: string;
}

export class BroadcastWorker {
  private wahaService = new WahaService();
  private templateEngine = new TemplateEngine();

  async processJob(job: {
    id: string;
    broadcast_id: string;
    phone: string;
    variables: string;
    attempts: number;
    worker_id: string;
  }, campaign: {
    user_id: string;
    template_body: string;
    media_attachments: string;
  }): Promise<JobProcessResult> {
    const startTime = Date.now();
    
    try {
      // 1. Get campaign owner session credentials
      const [credRows] = await pool.execute<any[]>(
        "SELECT whatsapp_session_name FROM user_credentials WHERE user_id = ? LIMIT 1",
        [campaign.user_id]
      );

      const sessionName = credRows.length > 0 ? credRows[0].whatsapp_session_name : "default";

      // 2. Parse variables & compile text template
      let variablesMap: Record<string, string> = {};
      try {
        variablesMap = JSON.parse(job.variables || "{}");
      } catch {}

      const compiledText = this.templateEngine.compile(campaign.template_body, variablesMap);
      const mediaList = JSON.parse(campaign.media_attachments || "[]");

      let wahaMessageId = "";

      // 3. Dispatch via WAHA layer
      if (mediaList.length > 0) {
        for (let i = 0; i < mediaList.length; i++) {
          const media = mediaList[i];
          const caption = i === 0 ? compiledText : "";
          const res = await this.wahaService.sendFile(sessionName, job.phone, media.url, media.filename, caption);
          wahaMessageId = res.wahaMessageId;
        }
      } else {
        const res = await this.wahaService.sendText(sessionName, job.phone, compiledText);
        wahaMessageId = res.wahaMessageId;
      }

      // Record logs
      logger.info({
        workerId: job.worker_id,
        campaignId: job.broadcast_id,
        recipient: job.phone,
        wahaMessageId,
        attempt: job.attempts + 1,
        duration: Date.now() - startTime,
        status: "sent"
      }, "✉️ Broadcast queue message delivered successfully");

      return {
        status: "sent",
        wahaMessageId
      };
    } catch (err: any) {
      const duration = Date.now() - startTime;
      const errorMsg = err.message || "Unknown delivery failure";

      // Refinement 4: Classify failure exceptions
      let resultStatus: "failed" | "dead_letter" | "wait" = "failed";

      const errLower = errorMsg.toLowerCase();
      if (errLower.includes("invalid") || errLower.includes("not found") || errLower.includes("format") || errLower.includes("400")) {
        // Invalid number/format -> permanent failure (dead letter)
        resultStatus = "dead_letter";
      } else if (errLower.includes("rate") || errLower.includes("limit") || errLower.includes("429")) {
        // Rate limit -> wait
        resultStatus = "wait";
      } else if (err.code === "ECONNREFUSED" || err.code === "ETIMEDOUT" || errLower.includes("network")) {
        // Network timeout -> retry standard
        resultStatus = "failed";
      }

      logger.warn({
        workerId: job.worker_id,
        campaignId: job.broadcast_id,
        recipient: job.phone,
        attempt: job.attempts + 1,
        duration,
        status: resultStatus,
        error: errorMsg
      }, "⚠️ Broadcast queue message delivery failed");

      return {
        status: resultStatus,
        errorMessage: errorMsg
      };
    }
  }
}
