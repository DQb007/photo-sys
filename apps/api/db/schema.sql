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
  user_id BIGINT UNSIGNED NOT NULL,
  prompt TEXT NOT NULL,
  model VARCHAR(100) NOT NULL DEFAULT 'gpt-image-2',
  status ENUM('pending', 'processing', 'succeeded', 'failed') NOT NULL DEFAULT 'pending',
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
  INDEX idx_generations_created_at (created_at),
  INDEX idx_generations_status (status),
  INDEX idx_generations_deleted_at (deleted_at),
  CONSTRAINT fk_generations_user
    FOREIGN KEY (user_id)
    REFERENCES users (id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_generations_deleted_by
    FOREIGN KEY (deleted_by)
    REFERENCES users (id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS credit_transactions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  type ENUM('initial_grant', 'admin_adjustment', 'generation_debit', 'generation_refund') NOT NULL,
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
