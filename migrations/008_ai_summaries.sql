CREATE TABLE IF NOT EXISTS `ai_summaries` (
  `id` VARCHAR(36) PRIMARY KEY,
  `chat_id` VARCHAR(36) UNIQUE NOT NULL,
  `summary` TEXT NOT NULL,
  `sentiment` ENUM('positive', 'neutral', 'negative') NOT NULL DEFAULT 'neutral',
  `lead_score` INT NOT NULL DEFAULT 0,
  `next_action` VARCHAR(255) NULL DEFAULT NULL,
  `last_message_hash` VARCHAR(64) NOT NULL,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`chat_id`) REFERENCES `whatsapp_chats` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
