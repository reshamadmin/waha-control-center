CREATE TABLE IF NOT EXISTS `whatsapp_messages` (
  `id` VARCHAR(36) PRIMARY KEY,
  `chat_id` VARCHAR(36) NOT NULL,
  `user_id` VARCHAR(36) NOT NULL,
  `direction` ENUM('inbound', 'outbound') NOT NULL,
  `waha_message_id` VARCHAR(100) UNIQUE NULL DEFAULT NULL,
  `message_type` VARCHAR(50) NOT NULL DEFAULT 'text',
  `body` TEXT NULL DEFAULT NULL,
  `media_url` TEXT NULL DEFAULT NULL,
  `status` ENUM('sending', 'sent', 'delivered', 'read', 'failed') DEFAULT 'sending',
  `sent_at` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`chat_id`) REFERENCES `whatsapp_chats` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
