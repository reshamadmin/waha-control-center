CREATE TABLE IF NOT EXISTS `broadcast_queue` (
  `id` VARCHAR(36) PRIMARY KEY,
  `broadcast_id` VARCHAR(36) NOT NULL,
  `phone` VARCHAR(30) NOT NULL,
  `recipient_name` VARCHAR(100) NULL DEFAULT NULL,
  `message_body` TEXT NOT NULL,
  `media_url` TEXT NULL DEFAULT NULL,
  `status` ENUM('pending', 'processing', 'completed', 'failed') NOT NULL DEFAULT 'pending',
  `retry_count` INT NOT NULL DEFAULT 0,
  `last_error` VARCHAR(255) NULL DEFAULT NULL,
  `scheduled_at` TIMESTAMP NOT NULL,
  `processed_at` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_poll_status` (`status`, `scheduled_at`),
  FOREIGN KEY (`broadcast_id`) REFERENCES `broadcasts` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
