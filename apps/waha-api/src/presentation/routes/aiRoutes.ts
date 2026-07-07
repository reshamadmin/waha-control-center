import { Router } from "express";
import crypto from "node:crypto";
import { requireAuth } from "../../application/auth.js";
import { pool } from "../../infrastructure/db.js";
import { GeminiAIProvider } from "../../infrastructure/providers/GeminiAIProvider.js";
import { logger } from "../../infrastructure/logger.js";

const router = Router();
const aiProvider = new GeminiAIProvider();

// Helper to query session name
async function getSessionDetails(userId: string) {
  const [rows] = await pool.execute<any[]>(
    "SELECT whatsapp_session_name FROM user_credentials WHERE user_id = ? LIMIT 1",
    [userId]
  );
  if (rows.length === 0) return "default";
  return rows[0].whatsapp_session_name || "default";
}

// GET /api/ai/analyze/:chatId - Fetch existing structured intelligence
router.get("/analyze/:chatId", requireAuth, async (req, res, next) => {
  try {
    const { chatId } = req.params;
    const [rows] = await pool.execute<any[]>(
      "SELECT * FROM conversation_ai WHERE chat_id = ? LIMIT 1",
      [chatId]
    );

    if (rows.length === 0) {
      res.json({ status: "success", intelligence: null });
      return;
    }

    const item = rows[0];
    res.json({
      status: "success",
      intelligence: {
        summary: item.summary,
        intent: item.intent,
        priority: item.priority,
        sentiment: item.sentiment,
        language: item.language,
        actionRequired: !!item.action_required,
        followUpDate: item.follow_up_date,
        productInterest: item.product_interest,
        governmentOpportunity: !!item.government_opportunity,
        fundingOpportunity: !!item.funding_opportunity,
        decisionMaker: item.decision_maker,
        importantNumbers: JSON.parse(item.important_numbers || "[]"),
        keywords: JSON.parse(item.keywords || "[]"),
        knowledgeFacts: JSON.parse(item.knowledge_facts || "[]")
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/ai/analyze - Enqueues background async AI analysis job
router.post("/analyze", requireAuth, async (req, res, next) => {
  try {
    const { chatId } = req.body;
    if (!chatId) {
      res.status(400).json({ status: "error", message: "chatId is required." });
      return;
    }

    // Insert an AI analysis task into the queue
    const taskId = `tsk_${crypto.randomUUID()}`;
    await pool.execute(
      `INSERT INTO broadcast_queue (id, broadcast_id, phone, variables, status, attempts, retry_count, job_type)
       VALUES (?, 'ai_job', ?, '{}', 'pending', 0, 0, 'ai_analysis')`,
      [taskId, chatId]
    );

    logger.info({ chatId, taskId }, "📥 Enqueued background conversation intelligence job");

    res.json({
      status: "success",
      message: "Analysis job enqueued successfully.",
      taskId
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/ai/reply - Generates suggested response in 4 styles
router.post("/reply", requireAuth, async (req, res, next) => {
  try {
    const { chatId } = req.body;
    if (!chatId) {
      res.status(400).json({ status: "error", message: "chatId is required." });
      return;
    }

    // 1. Fetch last 20 messages
    const [msgRows] = await pool.execute<any[]>(
      `SELECT direction, bodyText 
       FROM whatsapp_messages 
       WHERE chat_id = ? 
       ORDER BY sent_at DESC 
       LIMIT 20`,
      [chatId]
    );

    if (msgRows.length === 0) {
      res.status(400).json({ status: "error", message: "No message logs found to construct reply." });
      return;
    }

    const messagesLog = msgRows
      .reverse()
      .map(m => `${m.direction === "inbound" ? "Customer" : "Agent"}: ${m.bodyText}`)
      .join("\n");

    // 2. Fetch Prompt Reply template
    const [promptRows] = await pool.execute<any[]>(
      "SELECT prompt_body FROM prompt_templates WHERE prompt_key = 'REPLY' LIMIT 1"
    );

    const systemPrompt = promptRows.length > 0 ? promptRows[0].prompt_body : "";
    const finalPrompt = `${systemPrompt}\n\nChat Conversation Log:\n${messagesLog}\n\nJSON output:`;

    // 3. Dispatch to AI
    const rawRes = await aiProvider.analyzeText(finalPrompt, "reply");
    const cleanJson = rawRes.replace(/```json/gi, "").replace(/```/gi, "").trim();

    let replies = {};
    try {
      replies = JSON.parse(cleanJson);
    } catch {
      replies = {
        professional: rawRes,
        friendly: rawRes,
        short: rawRes.substring(0, 100),
        detailed: rawRes
      };
    }

    res.json({
      status: "success",
      replies
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/ai/feedback - Logs prompt 👍/👎 reviews
router.post("/feedback", requireAuth, async (req, res, next) => {
  try {
    const { chatId, promptKey, generatedText, feedbackType, comment } = req.body;

    if (!chatId || !promptKey || !generatedText || !feedbackType) {
      res.status(400).json({ status: "error", message: "Missing required feedback fields." });
      return;
    }

    const id = `fbk_${crypto.randomUUID()}`;
    await pool.execute(
      `INSERT INTO ai_feedback (id, chat_id, prompt_key, generated_text, feedback_type, comment)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, chatId, promptKey, generatedText, feedbackType, comment || null]
    );

    res.json({
      status: "success",
      message: "Feedback submitted successfully."
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/ai/prompts - Fetch Prompts Library
router.get("/prompts", requireAuth, async (req, res, next) => {
  try {
    const [rows] = await pool.execute("SELECT * FROM prompt_templates ORDER BY title ASC");
    res.json({
      status: "success",
      prompts: rows
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/ai/prompts/:id - Update custom prompts template
router.put("/prompts/:id", requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { promptBody } = req.body;

    if (!promptBody) {
      res.status(400).json({ status: "error", message: "promptBody is required." });
      return;
    }

    await pool.execute(
      "UPDATE prompt_templates SET prompt_body = ? WHERE id = ?",
      [promptBody, id]
    );

    res.json({
      status: "success",
      message: "Prompt template updated successfully."
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/ai/prompts/test - Playpen test prompt
router.post("/prompts/test", requireAuth, async (req, res, next) => {
  try {
    const { promptText, testInput } = req.body;

    if (!promptText || !testInput) {
      res.status(400).json({ status: "error", message: "promptText and testInput are required." });
      return;
    }

    const finalPrompt = `${promptText}\n\nTest Context Input:\n${testInput}`;
    const output = await aiProvider.analyzeText(finalPrompt, "test");

    res.json({
      status: "success",
      output
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/ai/usage - Fetch token costs aggregates
router.get("/usage", requireAuth, async (req, res, next) => {
  try {
    const [dayRows] = await pool.execute<any[]>(
      `SELECT DATE(created_at) as date, 
              COUNT(id) as total_requests,
              SUM(prompt_tokens) as total_prompt_tokens,
              SUM(completion_tokens) as total_completion_tokens,
              AVG(latency_ms) as avg_latency_ms,
              SUM(estimated_cost) as total_cost
       FROM ai_usage
       GROUP BY DATE(created_at)
       ORDER BY DATE(created_at) DESC
       LIMIT 30`
    );

    const [monthRows] = await pool.execute<any[]>(
      `SELECT DATE_FORMAT(created_at, '%Y-%m') as month, 
              COUNT(id) as total_requests,
              SUM(prompt_tokens) as total_prompt_tokens,
              SUM(completion_tokens) as total_completion_tokens,
              AVG(latency_ms) as avg_latency_ms,
              SUM(estimated_cost) as total_cost
       FROM ai_usage
       GROUP BY DATE_FORMAT(created_at, '%Y-%m')
       ORDER BY DATE_FORMAT(created_at, '%Y-%m') DESC`
    );

    res.json({
      status: "success",
      usage: {
        daily: dayRows,
        monthly: monthRows
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/ai/search - Universal AI semantic filters query (Refinement 9)
router.post("/search", requireAuth, async (req, res, next) => {
  try {
    const { query } = req.body;
    if (!query) {
      res.status(400).json({ status: "error", message: "Query string is required." });
      return;
    }

    const searchWildcard = `%${query}%`;
    const sql = `
      SELECT c.id as chat_id, c.contact_name, c.contact_phone, 
             cai.summary, cai.product_interest, cai.intent, cai.priority, cai.sentiment
      FROM conversation_ai cai
      JOIN whatsapp_chats c ON cai.chat_id = c.id
      WHERE cai.summary LIKE ? 
         OR cai.product_interest LIKE ? 
         OR cai.intent LIKE ? 
         OR cai.keywords LIKE ? 
         OR cai.knowledge_facts LIKE ?
      LIMIT 50
    `;

    const [rows] = await pool.execute(sql, [
      searchWildcard,
      searchWildcard,
      searchWildcard,
      searchWildcard,
      searchWildcard
    ]);

    res.json({
      status: "success",
      results: rows
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/ai/campaign - Aggregates campaign responses sentiment
router.post("/campaign", requireAuth, async (req, res, next) => {
  try {
    const { campaignId } = req.body;
    if (!campaignId) {
      res.status(400).json({ status: "error", message: "campaignId is required." });
      return;
    }

    // Fetch all processed replies in the queue
    const [queueRows] = await pool.execute<any[]>(
      `SELECT q.phone, q.variables 
       FROM broadcast_queue q
       WHERE q.broadcast_id = ? AND q.status = 'sent'`,
      [campaignId]
    );

    if (queueRows.length === 0) {
      res.json({ status: "success", categories: {}, reasons: [] });
      return;
    }

    // Fetch Campaign template prompt
    const [promptRows] = await pool.execute<any[]>(
      "SELECT prompt_body FROM prompt_templates WHERE prompt_key = 'CAMPAIGN' LIMIT 1"
    );
    const systemPrompt = promptRows.length > 0 ? promptRows[0].prompt_body : "";

    const categoriesMap: Record<string, number> = {
      "Interested": 0,
      "Need quotation": 0,
      "Wrong number": 0,
      "Call later": 0,
      "Already purchased": 0,
      "Government enquiry": 0,
      "Complaint": 0,
      "Other": 0
    };
    const reasons: any[] = [];

    // Analyze up to 10 replies to compile aggregate campaign insights efficiently
    const sampleRows = queueRows.slice(0, 10);

    for (const row of sampleRows) {
      // Find last inbound message for this customer
      const [msgRows] = await pool.execute<any[]>(
        `SELECT bodyText FROM whatsapp_messages 
         WHERE contact_phone = ? AND direction = 'inbound' 
         ORDER BY sent_at DESC LIMIT 1`,
        [row.phone]
      );

      if (msgRows.length > 0) {
        const text = msgRows[0].bodyText;
        const finalPrompt = `${systemPrompt}\n\nCustomer Reply:\n"${text}"\n\nJSON output:`;
        
        try {
          const aiRes = await aiProvider.analyzeText(finalPrompt, "campaign");
          const cleanJson = aiRes.replace(/```json/gi, "").replace(/```/gi, "").trim();
          const parsed = JSON.parse(cleanJson);
          const cat = parsed.category || "Other";
          
          if (categoriesMap[cat] !== undefined) {
            categoriesMap[cat]++;
          } else {
            categoriesMap["Other"]++;
          }
          
          reasons.push({ phone: row.phone, category: cat, comment: text, reason: parsed.reason });
        } catch {
          categoriesMap["Other"]++;
        }
      }
    }

    res.json({
      status: "success",
      categories: categoriesMap,
      reasons
    });
  } catch (err) {
    next(err);
  }
});

export { router as aiRouter };
