CREATE TABLE IF NOT EXISTS `user_credentials` (
  `id` VARCHAR(36) PRIMARY KEY,
  `user_id` VARCHAR(36) UNIQUE NOT NULL,
  `whatsapp_session_name` VARCHAR(100) UNIQUE NULL,
  `whatsapp_session_status` ENUM('DISCONNECTED', 'SCAN_QR', 'CONNECTED') NOT NULL DEFAULT 'DISCONNECTED',
  `whatsapp_connected_at` TIMESTAMP NULL DEFAULT NULL,
  
  -- Encrypted integrations credentials
  `zoho_email` VARCHAR(191) NULL DEFAULT NULL,
  `zoho_app_password_encrypted` TEXT NULL DEFAULT NULL,
  `google_email` VARCHAR(191) NULL DEFAULT NULL,
  `google_refresh_token_encrypted` TEXT NULL DEFAULT NULL,
  
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
