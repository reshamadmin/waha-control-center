CREATE TABLE IF NOT EXISTS `message_templates` (
  `id` VARCHAR(36) PRIMARY KEY,
  `title` VARCHAR(100) NOT NULL,
  `category` VARCHAR(50) NOT NULL,
  `body` TEXT NOT NULL,
  `variables` TEXT DEFAULT NULL,
  `created_by` VARCHAR(36) NOT NULL,
  `active` TINYINT DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `message_templates` (id, title, category, body, variables, created_by, active) VALUES
('tmpl_thanks', '/thanks', 'quick_reply', 'Hi {{name}}, thank you for contacting Resham Sutra! How can we assist you today?', 'name', 'usr_admin_default', 1),
('tmpl_catalog', '/catalog', 'quick_reply', 'Hello, you can view our latest product catalog here: http://localhost:3002/uploads/catalog.pdf', '', 'usr_admin_default', 1),
('tmpl_meeting', '/meeting', 'quick_reply', 'Hi {{name}}, let\'s schedule a meeting! Please select a convenient time slot here: https://calendly.com/reshamsutra', 'name', 'usr_admin_default', 1),
('tmpl_payment', '/payment', 'quick_reply', 'Dear customer, here is your invoice payment link: https://rzp.io/l/reshamsutra', '', 'usr_admin_default', 1);
