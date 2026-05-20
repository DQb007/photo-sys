ALTER TABLE users
  ADD COLUMN credit_balance INT UNSIGNED NOT NULL DEFAULT 0 AFTER last_login_at;

ALTER TABLE generations
  ADD COLUMN credit_cost INT UNSIGNED NOT NULL DEFAULT 0 AFTER count,
  ADD COLUMN credit_refunded_at TIMESTAMP NULL AFTER credit_cost;

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
