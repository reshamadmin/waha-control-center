CREATE TABLE IF NOT EXISTS `whatsapp_chats` (
  `id` VARCHAR(36) PRIMARY KEY,
  `user_id` VARCHAR(36) NOT NULL,
  `customer_id` VARCHAR(36) NULL DEFAULT NULL,
  `waha_chat_id` VARCHAR(100) NOT NULL,
  `contact_phone` VARCHAR(30) NULL DEFAULT NULL,
  `contact_name` VARCHAR(100) NULL DEFAULT NULL,
  `last_message_at` TIMESTAMP NULL DEFAULT NULL,
  `last_message_preview` TEXT NULL DEFAULT NULL,
  `unread_count` INT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `idx_user_waha` (`user_id`, `waha_chat_id`),
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
