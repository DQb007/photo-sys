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
