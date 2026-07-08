CREATE TABLE IF NOT EXISTS `system_logs` (
  `id` VARCHAR(50) PRIMARY KEY,
  `level` ENUM('INFO', 'WARN', 'ERROR', 'FATAL') NOT NULL DEFAULT 'INFO',
  `source` ENUM('API', 'Worker', 'WAHA', 'AI') NOT NULL DEFAULT 'API',
  `request_id` VARCHAR(36) DEFAULT NULL,
  `user_id` VARCHAR(36) DEFAULT NULL,
  `job_id` VARCHAR(36) DEFAULT NULL,
  `campaign_id` VARCHAR(36) DEFAULT NULL,
  `conversation_id` VARCHAR(36) DEFAULT NULL,
  `endpoint` VARCHAR(255) DEFAULT NULL,
  `message` TEXT NOT NULL,
  `stack` TEXT DEFAULT NULL,
  `metadata` TEXT DEFAULT NULL, -- JSON formatted data
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `app_feedback` (
  `id` VARCHAR(50) PRIMARY KEY,
  `page` VARCHAR(255) NOT NULL,
  `conversation_id` VARCHAR(36) DEFAULT NULL,
  `browser` TEXT NOT NULL,
  `comments` TEXT NOT NULL,
  `screenshot_url` TEXT DEFAULT NULL,
  `application_version` VARCHAR(50) NOT NULL DEFAULT '1.0.0-rc1',
  `browser_version` VARCHAR(50) DEFAULT NULL,
  `screen_resolution` VARCHAR(50) DEFAULT NULL,
  `current_route` VARCHAR(255) DEFAULT NULL,
  `worker_status` VARCHAR(50) DEFAULT NULL,
  `queue_depth` INT DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `system_metrics_history` (
  `id` VARCHAR(50) PRIMARY KEY,
  `messages_sent_count` INT DEFAULT 0,
  `ai_requests_count` INT DEFAULT 0,
  `avg_latency_ms` INT DEFAULT 0,
  `queue_depth` INT DEFAULT 0,
  `recorded_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `feature_flags` (
  `id` VARCHAR(36) PRIMARY KEY,
  `flag_key` VARCHAR(50) UNIQUE NOT NULL,
  `flag_name` VARCHAR(100) NOT NULL,
  `is_enabled` BOOLEAN DEFAULT TRUE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed default feature flags
INSERT INTO `feature_flags` (`id`, `flag_key`, `flag_name`, `is_enabled`)
VALUES
  ('ff_ai', 'AI_ENABLED', 'Conversation AI Analytics', TRUE),
  ('ff_broad', 'BROADCAST_ENABLED', 'Campaign Broadcasts Scheduler', TRUE),
  ('ff_email', 'EMAIL_ENABLED', 'Outbound Email Notifications', FALSE),
  ('ff_kb', 'KNOWLEDGE_BASE_ENABLED', 'Extracted Facts Search', TRUE)
ON DUPLICATE KEY UPDATE `flag_key` = `flag_key`;
