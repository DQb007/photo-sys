ALTER TABLE credit_transactions
  MODIFY COLUMN type ENUM('initial_grant', 'admin_adjustment', 'generation_debit', 'generation_refund', 'redeem_code_credit') NOT NULL;

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
