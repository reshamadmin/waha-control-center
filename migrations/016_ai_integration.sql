CREATE TABLE IF NOT EXISTS `prompt_templates` (
  `id` VARCHAR(36) PRIMARY KEY,
  `prompt_key` VARCHAR(50) UNIQUE NOT NULL,
  `title` VARCHAR(100) NOT NULL,
  `prompt_body` TEXT NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `conversation_ai` (
  `id` VARCHAR(36) PRIMARY KEY,
  `chat_id` VARCHAR(36) UNIQUE NOT NULL,
  `summary` TEXT,
  `intent` VARCHAR(100),
  `priority` ENUM('LOW', 'MEDIUM', 'HIGH') DEFAULT 'LOW',
  `sentiment` ENUM('POSITIVE', 'NEUTRAL', 'NEGATIVE') DEFAULT 'NEUTRAL',
  `language` VARCHAR(50),
  `action_required` BOOLEAN DEFAULT FALSE,
  `follow_up_date` DATE DEFAULT NULL,
  `product_interest` VARCHAR(255) DEFAULT NULL,
  `government_opportunity` BOOLEAN DEFAULT FALSE,
  `funding_opportunity` BOOLEAN DEFAULT FALSE,
  `decision_maker` VARCHAR(255) DEFAULT NULL,
  `important_numbers` TEXT DEFAULT NULL, -- JSON array of strings
  `keywords` TEXT DEFAULT NULL,          -- JSON array of strings
  `knowledge_facts` TEXT DEFAULT NULL,    -- JSON array of strings
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`chat_id`) REFERENCES `whatsapp_chats` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ai_usage` (
  `id` VARCHAR(36) PRIMARY KEY,
  `request_type` VARCHAR(50) NOT NULL,
  `prompt_tokens` INT NOT NULL DEFAULT 0,
  `completion_tokens` INT NOT NULL DEFAULT 0,
  `latency_ms` INT NOT NULL DEFAULT 0,
  `estimated_cost` DECIMAL(10, 6) NOT NULL DEFAULT 0.000000,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ai_feedback` (
  `id` VARCHAR(36) PRIMARY KEY,
  `chat_id` VARCHAR(36) NOT NULL,
  `prompt_key` VARCHAR(50) NOT NULL,
  `generated_text` TEXT NOT NULL,
  `feedback_type` ENUM('LIKE', 'DISLIKE') NOT NULL,
  `comment` TEXT DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Extend broadcast_queue to support ai jobs too or create a queue type
ALTER TABLE `broadcast_queue`
  ADD COLUMN `job_type` VARCHAR(50) NOT NULL DEFAULT 'broadcast';

-- Seed prompt templates
INSERT INTO `prompt_templates` (`id`, `prompt_key`, `title`, `prompt_body`)
VALUES 
(
  'pt_summary',
  'SUMMARY',
  'Conversation Summary Prompt',
  'Analyze the following conversation logs between a customer and our support representative. Extract a concise summary of their dialogue.'
),
(
  'pt_classification',
  'CLASSIFICATION',
  'Semantic Fact & Intent Extractor',
  'Analyze the following message log. Extract structured data as a JSON object with keys:\n{\n  \"summary\": \"concise overall summary\",\n  \"intent\": \"primary customer intent\",\n  \"priority\": \"LOW\" | \"MEDIUM\" | \"HIGH\",\n  \"sentiment\": \"POSITIVE\" | \"NEUTRAL\" | \"NEGATIVE\",\n  \"language\": \"detected language\",\n  \"action_required\": true | false,\n  \"follow_up_date\": \"YYYY-MM-DD\" or null,\n  \"product_interest\": \"specific machinery or silk items\" or null,\n  \"government_opportunity\": true | false,\n  \"funding_opportunity\": true | false,\n  \"decision_maker\": \"name of decision maker\" or null,\n  \"important_numbers\": [\"array of phone numbers or counts\"],\n  \"keywords\": [\"array of tags\"],\n  \"knowledge_facts\": [\"array of verified statements/needs from the customer\"]\n}\nDo not include markdown blocks like ```json, output ONLY the raw JSON string.'
),
(
  'pt_reply',
  'REPLY',
  'Multi-Style Suggested Replies Composer',
  'Based on the conversation history below, compose a suitable reply to the last message. Return a JSON object with 4 styles of response using keys:\n{\n  \"professional\": \"Polite, formal corporate response\",\n  \"friendly\": \"Warm, empathetic helper tone\",\n  \"short\": \"Quick, direct answer\",\n  \"detailed\": \"Explanatory, thorough reply with details\"\n}\nDo not include markdown tags, output ONLY the raw JSON string.'
),
(
  'pt_campaign',
  'CAMPAIGN',
  'Campaign Reply Classification',
  'Analyze the provided customer reply to our campaign message. Categorize this reply into exactly one of these labels: \"Interested\", \"Need quotation\", \"Wrong number\", \"Call later\", \"Already purchased\", \"Government enquiry\", \"Complaint\", or \"Other\". Return a JSON object with key \"category\" and \"reason\".'
)
ON DUPLICATE KEY UPDATE `prompt_body` = VALUES(`prompt_body`);
