CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email VARCHAR(255) NOT NULL,
  display_name VARCHAR(120) NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('user', 'admin') NOT NULL DEFAULT 'user',
  status ENUM('pending_email_verification', 'active', 'disabled') NOT NULL DEFAULT 'pending_email_verification',
  email_verified_at TIMESTAMP NULL,
  last_login_at TIMESTAMP NULL,
  credit_balance INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  INDEX idx_users_role (role),
  INDEX idx_users_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_email_verification_tokens_hash (token_hash),
  INDEX idx_email_verification_tokens_user_id (user_id),
  INDEX idx_email_verification_tokens_expires_at (expires_at),
  CONSTRAINT fk_email_verification_tokens_user
    FOREIGN KEY (user_id)
    REFERENCES users (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_user_id BIGINT UNSIGNED NULL,
  actor_email VARCHAR(255) NULL,
  action VARCHAR(100) NOT NULL,
  target_type VARCHAR(100) NULL,
  target_id VARCHAR(100) NULL,
  target_user_id BIGINT UNSIGNED NULL,
  metadata_json JSON NULL,
  ip_address VARCHAR(100) NULL,
  user_agent VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_audit_logs_created_at (created_at),
  INDEX idx_audit_logs_actor_user_id (actor_user_id),
  INDEX idx_audit_logs_target_user_id (target_user_id),
  INDEX idx_audit_logs_action (action)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_settings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  setting_key VARCHAR(160) NOT NULL,
  setting_value TEXT NULL,
  value_type ENUM('string', 'number', 'boolean', 'json', 'secret') NOT NULL DEFAULT 'string',
  category VARCHAR(80) NOT NULL,
  is_secret TINYINT(1) NOT NULL DEFAULT 0,
  description VARCHAR(500) NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_app_settings_key (setting_key),
  INDEX idx_app_settings_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS generations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL,
  guest_session_id BIGINT UNSIGNED NULL,
  prompt TEXT NOT NULL,
  model VARCHAR(100) NOT NULL DEFAULT 'gpt-image-2',
  status ENUM('pending', 'processing', 'succeeded', 'failed', 'cancelled') NOT NULL DEFAULT 'pending',
  size VARCHAR(50) NULL,
  quality VARCHAR(50) NULL,
  count INT UNSIGNED NOT NULL DEFAULT 1,
  credit_cost INT UNSIGNED NOT NULL DEFAULT 0,
  credit_refunded_at TIMESTAMP NULL,
  reference_image_path VARCHAR(500) NULL,
  error_message TEXT NULL,
  started_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  duration_ms INT UNSIGNED NULL,
  deleted_at TIMESTAMP NULL,
  deleted_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_generations_user_created_at (user_id, created_at),
  INDEX idx_generations_guest_created_at (guest_session_id, created_at),
  INDEX idx_generations_created_at (created_at),
  INDEX idx_generations_status (status),
  INDEX idx_generations_deleted_at (deleted_at),
  CONSTRAINT fk_generations_user
    FOREIGN KEY (user_id)
    REFERENCES users (id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_generations_guest_session
    FOREIGN KEY (guest_session_id)
    REFERENCES guest_sessions (id)
    ON DELETE SET NULL,
  CONSTRAINT fk_generations_deleted_by
    FOREIGN KEY (deleted_by)
    REFERENCES users (id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS credit_transactions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  type ENUM('initial_grant', 'admin_adjustment', 'generation_debit', 'generation_refund', 'redeem_code_credit', 'generation_cancel_refund', 'chat_message_debit', 'chat_message_refund') NOT NULL,
  amount INT NOT NULL,
  balance_after INT UNSIGNED NOT NULL,
  generation_id BIGINT UNSIGNED NULL,
  actor_user_id BIGINT UNSIGNED NULL,
  reason VARCHAR(500) NULL,
  metadata_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_credit_transactions_user_created_at (user_id, created_at),
  INDEX idx_credit_transactions_generation_id (generation_id),
  INDEX idx_credit_transactions_actor_user_id (actor_user_id),
  INDEX idx_credit_transactions_type (type),
  CONSTRAINT fk_credit_transactions_user
    FOREIGN KEY (user_id)
    REFERENCES users (id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_credit_transactions_generation
    FOREIGN KEY (generation_id)
    REFERENCES generations (id)
    ON DELETE SET NULL,
  CONSTRAINT fk_credit_transactions_actor
    FOREIGN KEY (actor_user_id)
    REFERENCES users (id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_models (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(160) NOT NULL,
  model_key VARCHAR(160) NOT NULL,
  base_url VARCHAR(1000) NOT NULL,
  api_key_encrypted TEXT NULL,
  status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  description VARCHAR(500) NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_chat_models_status_sort (status, sort_order, created_at),
  INDEX idx_chat_models_default (is_default, status),
  INDEX idx_chat_models_created_by (created_by),
  INDEX idx_chat_models_updated_by (updated_by),
  CONSTRAINT fk_chat_models_created_by
    FOREIGN KEY (created_by)
    REFERENCES users (id)
    ON DELETE SET NULL,
  CONSTRAINT fk_chat_models_updated_by
    FOREIGN KEY (updated_by)
    REFERENCES users (id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_conversations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL,
  guest_session_id BIGINT UNSIGNED NULL,
  title VARCHAR(160) NOT NULL,
  title_is_auto TINYINT(1) NOT NULL DEFAULT 1,
  status ENUM('active', 'deleted') NOT NULL DEFAULT 'active',
  last_message_at TIMESTAMP NULL,
  deleted_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_chat_conversations_user_updated (user_id, updated_at),
  INDEX idx_chat_conversations_user_status_last_message (user_id, status, last_message_at),
  INDEX idx_chat_conversations_guest_status_last_message (guest_session_id, status, last_message_at),
  CONSTRAINT fk_chat_conversations_user
    FOREIGN KEY (user_id)
    REFERENCES users (id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_chat_conversations_guest_session
    FOREIGN KEY (guest_session_id)
    REFERENCES guest_sessions (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  conversation_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  guest_session_id BIGINT UNSIGNED NULL,
  role ENUM('user', 'assistant', 'system') NOT NULL,
  content MEDIUMTEXT NOT NULL,
  status ENUM('streaming', 'completed', 'failed', 'cancelled') NOT NULL DEFAULT 'completed',
  error_message TEXT NULL,
  chat_model_id BIGINT UNSIGNED NULL,
  model_name_snapshot VARCHAR(160) NULL,
  model_key_snapshot VARCHAR(160) NULL,
  credit_cost INT UNSIGNED NOT NULL DEFAULT 0,
  credit_transaction_id BIGINT UNSIGNED NULL,
  credit_refunded_at TIMESTAMP NULL,
  metadata_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_chat_messages_conversation_created (conversation_id, created_at),
  INDEX idx_chat_messages_user_created (user_id, created_at),
  INDEX idx_chat_messages_guest_created (guest_session_id, created_at),
  INDEX idx_chat_messages_model (chat_model_id),
  INDEX idx_chat_messages_credit_transaction (credit_transaction_id),
  CONSTRAINT fk_chat_messages_conversation
    FOREIGN KEY (conversation_id)
    REFERENCES chat_conversations (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_chat_messages_user
    FOREIGN KEY (user_id)
    REFERENCES users (id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_chat_messages_guest_session
    FOREIGN KEY (guest_session_id)
    REFERENCES guest_sessions (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_chat_messages_model
    FOREIGN KEY (chat_model_id)
    REFERENCES chat_models (id)
    ON DELETE SET NULL,
  CONSTRAINT fk_chat_messages_credit_transaction
    FOREIGN KEY (credit_transaction_id)
    REFERENCES credit_transactions (id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS redeem_packages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  credits INT UNSIGNED NOT NULL,
  status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
  description VARCHAR(500) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_redeem_packages_status (status),
  INDEX idx_redeem_packages_created_at (created_at),
  CONSTRAINT fk_redeem_packages_created_by
    FOREIGN KEY (created_by)
    REFERENCES users (id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS redeem_code_batches (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  package_id BIGINT UNSIGNED NULL,
  package_name_snapshot VARCHAR(120) NOT NULL,
  credits_snapshot INT UNSIGNED NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  expires_at TIMESTAMP NULL,
  note VARCHAR(500) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_redeem_code_batches_package_id (package_id),
  INDEX idx_redeem_code_batches_created_at (created_at),
  INDEX idx_redeem_code_batches_expires_at (expires_at),
  CONSTRAINT fk_redeem_code_batches_package
    FOREIGN KEY (package_id)
    REFERENCES redeem_packages (id)
    ON DELETE SET NULL,
  CONSTRAINT fk_redeem_code_batches_created_by
    FOREIGN KEY (created_by)
    REFERENCES users (id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS redeem_codes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  batch_id BIGINT UNSIGNED NOT NULL,
  code_hash CHAR(64) NOT NULL,
  code_suffix VARCHAR(12) NOT NULL,
  credits INT UNSIGNED NOT NULL,
  status ENUM('active', 'disabled', 'redeemed') NOT NULL DEFAULT 'active',
  redeemed_by BIGINT UNSIGNED NULL,
  redeemed_at TIMESTAMP NULL,
  expires_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_redeem_codes_hash (code_hash),
  INDEX idx_redeem_codes_batch_id (batch_id),
  INDEX idx_redeem_codes_status (status),
  INDEX idx_redeem_codes_redeemed_by (redeemed_by),
  INDEX idx_redeem_codes_expires_at (expires_at),
  CONSTRAINT fk_redeem_codes_batch
    FOREIGN KEY (batch_id)
    REFERENCES redeem_code_batches (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_redeem_codes_redeemed_by
    FOREIGN KEY (redeemed_by)
    REFERENCES users (id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS prompt_templates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  title VARCHAR(160) NOT NULL,
  description VARCHAR(500) NULL,
  prompt_text TEXT NOT NULL,
  example_image_url VARCHAR(1000) NULL,
  category VARCHAR(80) NULL,
  status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
  sort_order INT NOT NULL DEFAULT 0,
  usage_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_prompt_templates_status_sort (status, sort_order, created_at),
  INDEX idx_prompt_templates_category (category),
  INDEX idx_prompt_templates_deleted_at (deleted_at),
  INDEX idx_prompt_templates_created_by (created_by),
  INDEX idx_prompt_templates_updated_by (updated_by),
  CONSTRAINT fk_prompt_templates_created_by
    FOREIGN KEY (created_by)
    REFERENCES users (id)
    ON DELETE SET NULL,
  CONSTRAINT fk_prompt_templates_updated_by
    FOREIGN KEY (updated_by)
    REFERENCES users (id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS prompt_template_favorites (
  user_id BIGINT UNSIGNED NOT NULL,
  template_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, template_id),
  INDEX idx_prompt_template_favorites_template_id (template_id),
  CONSTRAINT fk_prompt_template_favorites_user
    FOREIGN KEY (user_id)
    REFERENCES users (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_prompt_template_favorites_template
    FOREIGN KEY (template_id)
    REFERENCES prompt_templates (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS generation_images (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  generation_id BIGINT UNSIGNED NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  width INT UNSIGNED NULL,
  height INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_generation_images_generation_id (generation_id),
  CONSTRAINT fk_generation_images_generation
    FOREIGN KEY (generation_id)
    REFERENCES generations (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reference_uploads (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  content_sha256 CHAR(64) NOT NULL,
  storage_key VARCHAR(500) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  byte_size BIGINT UNSIGNED NOT NULL,
  original_name VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_reference_uploads_user_hash (user_id, content_sha256),
  UNIQUE KEY uq_reference_uploads_storage_key (storage_key),
  INDEX idx_reference_uploads_user_created_at (user_id, created_at),
  CONSTRAINT fk_reference_uploads_user
    FOREIGN KEY (user_id)
    REFERENCES users (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
