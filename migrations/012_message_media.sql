CREATE TABLE IF NOT EXISTS \`whatsapp_messages_media\` (
  \`id\` VARCHAR(36) PRIMARY KEY,
  \`message_id\` VARCHAR(36) NOT NULL,
  \`url\` TEXT NOT NULL,
  \`thumbnail_url\` TEXT DEFAULT NULL,
  \`mime_type\` VARCHAR(100) NOT NULL,
  \`filename\` VARCHAR(255) NOT NULL,
  \`filesize\` INT NOT NULL,
  \`width\` INT DEFAULT NULL,
  \`height\` INT DEFAULT NULL,
  \`duration\` INT DEFAULT NULL,
  \`checksum\` VARCHAR(64) DEFAULT NULL,
  \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (\`message_id\`) REFERENCES \`whatsapp_messages\` (\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
