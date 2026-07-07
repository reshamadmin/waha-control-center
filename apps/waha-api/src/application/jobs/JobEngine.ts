import crypto from "node:crypto";
import { pool } from "../../infrastructure/db.js";
import { BroadcastWorker } from "./BroadcastWorker.js";
import { logger } from "../../infrastructure/logger.js";
import { io } from "../../presentation/server.js";

export class JobEngine {
  private workerId = `wrk_${crypto.randomUUID().substring(0, 8)}`;
  private pollingTimer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private broadcastWorker = new BroadcastWorker();

  // Refinement 8: Worker Metrics collection
  private metrics = {
    messages_sent: 0,
    messages_failed: 0,
    total_durations: 0,
    average_send_time: 0,
    total_retries: 0,
    average_retry: 0,
    queue_depth: 0,
    worker_uptime_start: Date.now()
  };

  start() {
    logger.info({ workerId: this.workerId }, "👷 Starting Job Engine background polling worker...");
    // Poll the database queue every 3 seconds
    this.pollingTimer = setInterval(() => this.processNextJob(), 3000);
  }

  stop() {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      logger.info({ workerId: this.workerId }, "👷 Job Engine stopped.");
    }
  }

  getMetrics() {
    const uptimeSeconds = Math.floor((Date.now() - this.metrics.worker_uptime_start) / 1000);
    return {
      messages_sent: this.metrics.messages_sent,
      messages_failed: this.metrics.messages_failed,
      average_send_time_ms: this.metrics.average_send_time,
      average_retry_attempts: this.metrics.average_retry,
      queue_depth: this.metrics.queue_depth,
      worker_uptime: `${Math.floor(uptimeSeconds / 60)}m ${uptimeSeconds % 60}s`
    };
  }

  private async processNextJob() {
    // Prevent overlapping execution ticks
    if (this.isProcessing) return;
    this.isProcessing = true;

    const connection = await pool.getConnection();

    try {
      // 1. Transaction-locked dequeue (Refinement SELECT FOR UPDATE SKIP LOCKED)
      await connection.beginTransaction();

      const selectSql = `
        SELECT q.id, q.broadcast_id, q.phone, q.variables, q.attempts,
               b.user_id, b.template_body, b.media_attachments, b.sending_rules, b.status as campaign_status
        FROM broadcast_queue q
        JOIN broadcasts b ON q.broadcast_id = b.id
        WHERE q.status = 'pending' AND b.status = 'RUNNING'
        LIMIT 1
        FOR UPDATE SKIP LOCKED;
      `;

      const [rows] = await connection.execute<any[]>(selectSql);

      if (rows.length === 0) {
        await connection.commit();
        this.isProcessing = false;
        connection.release();
        return;
      }

      const job = rows[0];
      let rules: any = {};
      try {
        rules = JSON.parse(job.sending_rules || "{}");
      } catch {}

      // 2. Validate Business Hours filter (Refinement 6: Business Hours Scheduling)
      const now = new Date();
      const currentHoursStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      
      const hourStart = rules.restrictHoursStart || "00:00";
      const hourEnd = rules.restrictHoursEnd || "23:59";
      const restrictDays = rules.restrictWeekdays || [0, 1, 2, 3, 4, 5, 6]; // 0=Sunday, 1=Monday...

      const currentDay = now.getDay();

      if (currentHoursStr < hourStart || currentHoursStr > hourEnd || !restrictDays.includes(currentDay)) {
        logger.debug({ job: job.id, campaignId: job.broadcast_id }, "Skipping sending window, currently outside business hours limit.");
        // Rollback transaction to unlock the row
        await connection.rollback();
        this.isProcessing = false;
        connection.release();
        return;
      }

      // 3. Lock row by setting state to 'processing' and committing transaction immediately
      await connection.execute(
        "UPDATE broadcast_queue SET status = 'processing', worker_id = ? WHERE id = ?",
        [this.workerId, job.id]
      );
      await connection.commit();

      // Update depth metrics
      const [depthRows] = await pool.execute<any[]>(
        "SELECT COUNT(id) as depth FROM broadcast_queue WHERE status = 'pending'"
      );
      this.metrics.queue_depth = depthRows[0]?.depth || 0;

      // 4. Safe Sending Delays (Refinement 7)
      const delayMin = rules.randomDelayMin || 5;
      const delayMax = rules.randomDelayMax || 15;
      const delayMs = (Math.random() * (delayMax - delayMin) + delayMin) * 1000;
      await new Promise(resolve => setTimeout(resolve, delayMs));

      // 5. Execute worker processing
      const startTime = Date.now();
      const result = await this.broadcastWorker.processJob(
        {
          id: job.id,
          broadcast_id: job.broadcast_id,
          phone: job.phone,
          variables: job.variables,
          attempts: job.attempts,
          worker_id: this.workerId
        },
        {
          user_id: job.user_id,
          template_body: job.template_body,
          media_attachments: job.media_attachments
        }
      );

      const duration = Date.now() - startTime;
      const nextAttempt = job.attempts + 1;

      // 6. Update Database Status & Retry policies (Refinement 2: Finite attempt loops max 3)
      let finalStatus: "sent" | "failed" | "dead_letter" = "sent";
      let errorMsg = result.errorMessage || null;

      if (result.status === "sent") {
        finalStatus = "sent";
        this.metrics.messages_sent++;
      } else if (result.status === "wait" || result.status === "failed") {
        // Retry policies limit 3 attempts
        if (nextAttempt >= 3) {
          finalStatus = "dead_letter";
          this.metrics.messages_failed++;
        } else {
          finalStatus = "failed"; // Retry queue loader picks it up
        }
        this.metrics.total_retries += nextAttempt;
      } else if (result.status === "dead_letter") {
        finalStatus = "dead_letter"; // permanent failure classification
        this.metrics.messages_failed++;
      }

      await pool.execute(
        `UPDATE broadcast_queue 
         SET status = ?, error_message = ?, attempts = ?, processed_at = NOW() 
         WHERE id = ?`,
        [finalStatus, errorMsg, nextAttempt, job.id]
      );

      // Compile metrics averages
      const totalProcessed = this.metrics.messages_sent + this.metrics.messages_failed;
      this.metrics.total_durations += duration;
      this.metrics.average_send_time = Math.round(this.metrics.total_durations / totalProcessed);
      this.metrics.average_retry = Number((this.metrics.total_retries / (totalProcessed || 1)).toFixed(1));

      // 7. Check campaign completion state (Refinement 7: Emit structured events)
      const [pendingRows] = await pool.execute<any[]>(
        "SELECT COUNT(id) as pending FROM broadcast_queue WHERE broadcast_id = ? AND status = 'pending'",
        [job.broadcast_id]
      );
      const remainingPending = pendingRows[0].pending;

      const [statRows] = await pool.execute<any[]>(
        `SELECT COUNT(id) as total,
                SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
                SUM(CASE WHEN status = 'dead_letter' THEN 1 ELSE 0 END) as dead_letter
         FROM broadcast_queue
         WHERE broadcast_id = ?`,
        [job.broadcast_id]
      );

      const stats = statRows[0];
      const total = stats.total || 0;
      const sent = stats.sent || 0;
      const failed = (stats.failed || 0) + (stats.dead_letter || 0);

      const progressEventPayload = {
        campaignId: job.broadcast_id,
        title: job.title,
        totalRecipients: total,
        sent,
        failed,
        pending: remainingPending,
        successPercentage: total > 0 ? Math.round((sent / total) * 100) : 0,
        averageSendTimeMs: this.metrics.average_send_time
      };

      if (remainingPending === 0) {
        // Complete the campaign
        await pool.execute(
          "UPDATE broadcasts SET status = 'COMPLETED' WHERE id = ?",
          [job.broadcast_id]
        );
        logger.info({ campaignId: job.broadcast_id }, "🎉 Campaign broadcast completed all dispatches");

        io.emit("campaign.completed", progressEventPayload);
      } else {
        io.emit("campaign.progress", progressEventPayload);
      }

      io.emit("queue.updated", { queueDepth: this.metrics.queue_depth });

    } catch (err: any) {
      logger.error({ error: err.message }, "❌ Error processing queue item inside JobEngine");
      try {
        await connection.rollback();
      } catch {}
    } finally {
      this.isProcessing = false;
      connection.release();
    }
  }
}
