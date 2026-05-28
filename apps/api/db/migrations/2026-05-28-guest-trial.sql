CREATE TABLE IF NOT EXISTS guest_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  token_hash CHAR(64) NOT NULL,
  ip_address VARCHAR(100) NULL,
  user_agent VARCHAR(500) NULL,
  generation_limit INT UNSIGNED NOT NULL DEFAULT 2,
  generation_used INT UNSIGNED NOT NULL DEFAULT 0,
  chat_limit INT UNSIGNED NOT NULL DEFAULT 10,
  chat_used INT UNSIGNED NOT NULL DEFAULT 0,
  expires_at TIMESTAMP NOT NULL,
  last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_guest_sessions_token_hash (token_hash),
  INDEX idx_guest_sessions_ip_created_at (ip_address, created_at),
  INDEX idx_guest_sessions_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE generations
  MODIFY user_id BIGINT UNSIGNED NULL,
  ADD COLUMN guest_session_id BIGINT UNSIGNED NULL AFTER user_id,
  ADD INDEX idx_generations_guest_created_at (guest_session_id, created_at),
  ADD CONSTRAINT fk_generations_guest_session
    FOREIGN KEY (guest_session_id)
    REFERENCES guest_sessions (id)
    ON DELETE SET NULL;

INSERT INTO app_settings (setting_key, setting_value, value_type, category, is_secret, description)
VALUES
  ('trial.enabled', 'true', 'boolean', 'trial', 0, '是否开启游客试用'),
  ('trial.generationLimit', '2', 'number', 'trial', 0, '每个游客会话可创建的图片生成任务数'),
  ('trial.chatLimit', '10', 'number', 'trial', 0, '每个游客会话可发送的 AI 对话条数'),
  ('trial.sessionTtlHours', '168', 'number', 'trial', 0, '游客会话有效期小时数'),
  ('trial.maxSessionsPerIpPerDay', '5', 'number', 'trial', 0, '同 IP 每天最多创建游客会话数'),
  ('trial.allowReferenceImages', 'false', 'boolean', 'trial', 0, '游客是否可上传参考图'),
  ('trial.maxImagesPerGeneration', '1', 'number', 'trial', 0, '游客单次生成最大图片数量')
ON DUPLICATE KEY UPDATE setting_key = setting_key;
