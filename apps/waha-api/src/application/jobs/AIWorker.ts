import { pool } from "../../infrastructure/db.js";
import { GeminiAIProvider } from "../../infrastructure/providers/GeminiAIProvider.js";
import { logger } from "../../infrastructure/logger.js";
import { io } from "../../presentation/server.js";

export class AIWorker {
  private aiProvider = new GeminiAIProvider();

  async processJob(job: {
    id: string;
    phone: string; // Used to store chatId
    worker_id: string;
    attempts: number;
  }): Promise<{ status: "sent" | "failed" | "dead_letter" }> {
    const chatId = job.phone;
    
    try {
      // 1. Fetch last 20 messages for this chat context
      const [msgRows] = await pool.execute<any[]>(
        `SELECT direction, bodyText 
         FROM whatsapp_messages 
         WHERE chat_id = ? 
         ORDER BY sent_at DESC 
         LIMIT 20`,
        [chatId]
      );

      if (msgRows.length === 0) {
        logger.warn({ chatId }, "⚠️ No messages found to analyze for chat");
        return { status: "dead_letter" };
      }

      // Format logs list in chronological order
      const messagesLog = msgRows
        .reverse()
        .map(m => `${m.direction === "inbound" ? "Customer" : "Agent"}: ${m.bodyText}`)
        .join("\n");

      // 2. Fetch Classification Prompt template
      const [promptRows] = await pool.execute<any[]>(
        "SELECT prompt_body FROM prompt_templates WHERE prompt_key = 'CLASSIFICATION' LIMIT 1"
      );

      const systemPrompt = promptRows.length > 0 
        ? promptRows[0].prompt_body 
        : "Extract summary, intent, priority, sentiment from the conversation.";

      const finalPrompt = `${systemPrompt}\n\nChat Conversation Log:\n${messagesLog}\n\nJSON output:`;

      // 3. Request Gemini AI parsing
      const responseText = await this.aiProvider.analyzeText(finalPrompt, "analyze");

      // 4. Parse response string cleanly (stripping markdown backticks if any)
      const cleanJsonText = responseText
        .replace(/```json/gi, "")
        .replace(/```/gi, "")
        .trim();

      let parsedData: any = {};
      try {
        parsedData = JSON.parse(cleanJsonText);
      } catch (err: any) {
        logger.error({ error: err.message, rawText: responseText }, "❌ Failed to parse Gemini output as JSON in AIWorker");
        throw new Error("Invalid structured JSON returned from AI");
      }

      // 5. Update or insert into conversation_ai
      const summary = parsedData.summary || "No summary generated.";
      const intent = parsedData.intent || "Unknown";
      const priority = parsedData.priority || "LOW";
      const sentiment = parsedData.sentiment || "NEUTRAL";
      const language = parsedData.language || "English";
      const actionRequired = parsedData.action_required ? 1 : 0;
      const followUpDate = parsedData.follow_up_date || null;
      const productInterest = parsedData.product_interest || null;
      const govtOpp = parsedData.government_opportunity ? 1 : 0;
      const fundingOpp = parsedData.funding_opportunity ? 1 : 0;
      const decisionMaker = parsedData.decision_maker || null;
      const impNumbers = JSON.stringify(parsedData.important_numbers || []);
      const keywords = JSON.stringify(parsedData.keywords || []);
      const knowledgeFacts = JSON.stringify(parsedData.knowledge_facts || []);

      await pool.execute(
        `INSERT INTO conversation_ai (
          id, chat_id, summary, intent, priority, sentiment, language, action_required, 
          follow_up_date, product_interest, government_opportunity, funding_opportunity, 
          decision_maker, important_numbers, keywords, knowledge_facts
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
          summary = VALUES(summary),
          intent = VALUES(intent),
          priority = VALUES(priority),
          sentiment = VALUES(sentiment),
          language = VALUES(language),
          action_required = VALUES(action_required),
          follow_up_date = VALUES(follow_up_date),
          product_interest = VALUES(product_interest),
          government_opportunity = VALUES(government_opportunity),
          funding_opportunity = VALUES(funding_opportunity),
          decision_maker = VALUES(decision_maker),
          important_numbers = VALUES(important_numbers),
          keywords = VALUES(keywords),
          knowledge_facts = VALUES(knowledge_facts)`,
        [
          `cai_${crypto.randomUUID()}`,
          chatId,
          summary,
          intent,
          priority,
          sentiment,
          language,
          actionRequired,
          followUpDate,
          productInterest,
          govtOpp,
          fundingOpp,
          decisionMaker,
          impNumbers,
          keywords,
          knowledgeFacts
        ]
      );

      // 6. Emit live updates over socket
      io.emit("conversation.intelligence", {
        chatId,
        intelligence: {
          summary,
          intent,
          priority,
          sentiment,
          language,
          actionRequired: !!actionRequired,
          followUpDate,
          productInterest,
          governmentOpportunity: !!govtOpp,
          fundingOpportunity: !!fundingOpp,
          decisionMaker,
          importantNumbers: parsedData.important_numbers || [],
          keywords: parsedData.keywords || [],
          knowledgeFacts: parsedData.knowledge_facts || []
        }
      });

      return { status: "sent" };
    } catch (err: any) {
      logger.error({ error: err.message, chatId }, "❌ Error executing AI analysis job in AIWorker");
      return { status: "failed" };
    }
  }
}
