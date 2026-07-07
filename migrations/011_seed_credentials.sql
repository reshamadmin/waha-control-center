-- Seed default user credentials for admin mapping to WAHA session 'default'
INSERT INTO `user_credentials` (
  `id`, 
  `user_id`, 
  `whatsapp_session_name`, 
  `whatsapp_session_status`
) VALUES (
  'cred_admin_default', 
  'usr_admin_default', 
  'default', 
  'DISCONNECTED'
)
ON DUPLICATE KEY UPDATE `whatsapp_session_name` = `whatsapp_session_name`;
