CREATE TABLE IF NOT EXISTS generations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  prompt TEXT NOT NULL,
  model VARCHAR(100) NOT NULL DEFAULT 'gpt-image-2',
  status ENUM('pending', 'processing', 'succeeded', 'failed') NOT NULL DEFAULT 'pending',
  size VARCHAR(50) NULL,
  quality VARCHAR(50) NULL,
  count INT UNSIGNED NOT NULL DEFAULT 1,
  reference_image_path VARCHAR(500) NULL,
  error_message TEXT NULL,
  started_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  duration_ms INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_generations_created_at (created_at),
  INDEX idx_generations_status (status)
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
