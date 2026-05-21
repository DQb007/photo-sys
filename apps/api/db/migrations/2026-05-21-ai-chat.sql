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
  user_id BIGINT UNSIGNED NOT NULL,
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
  CONSTRAINT fk_chat_conversations_user
    FOREIGN KEY (user_id)
    REFERENCES users (id)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  conversation_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
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
  CONSTRAINT fk_chat_messages_model
    FOREIGN KEY (chat_model_id)
    REFERENCES chat_models (id)
    ON DELETE SET NULL,
  CONSTRAINT fk_chat_messages_credit_transaction
    FOREIGN KEY (credit_transaction_id)
    REFERENCES credit_transactions (id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE credit_transactions
  MODIFY type ENUM(
    'initial_grant',
    'admin_adjustment',
    'generation_debit',
    'generation_refund',
    'redeem_code_credit',
    'generation_cancel_refund',
    'chat_message_debit',
    'chat_message_refund'
  ) NOT NULL;

INSERT INTO app_settings (setting_key, setting_value, value_type, category, is_secret, description)
VALUES
  ('chat.enabled', 'true', 'boolean', 'chat', 0, 'Enable AI chat'),
  ('chat.messageCreditCost', '1', 'number', 'chat', 0, 'Credits charged per user chat message'),
  ('chat.systemPrompt', '', 'string', 'chat', 0, 'Global AI chat system prompt'),
  ('chat.maxInputChars', '8000', 'number', 'chat', 0, 'Maximum characters per user chat message'),
  ('chat.maxHistoryMessages', '20', 'number', 'chat', 0, 'Maximum historical messages sent to chat model'),
  ('chat.requestTimeoutMs', '120000', 'number', 'chat', 0, 'AI chat upstream request timeout in milliseconds')
ON DUPLICATE KEY UPDATE setting_key = setting_key;
