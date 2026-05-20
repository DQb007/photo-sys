CREATE TABLE IF NOT EXISTS prompt_templates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  title VARCHAR(160) NOT NULL,
  description VARCHAR(500) NULL,
  prompt_text TEXT NOT NULL,
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
