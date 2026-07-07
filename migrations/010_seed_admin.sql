-- Insert default Admin user. Hashed password is SHA-256 representation of 'admin123'
INSERT INTO `users` (`id`, `name`, `email`, `password_hash`, `role`, `default_persona`) 
VALUES (
  'usr_admin_default', 
  'Resham Sutra Admin', 
  'admin@reshamsutra.com', 
  '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', 
  'ADMIN', 
  'CRM'
)
ON DUPLICATE KEY UPDATE `email` = `email`;
