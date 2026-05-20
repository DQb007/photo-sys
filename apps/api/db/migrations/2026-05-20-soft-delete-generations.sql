ALTER TABLE generations
  ADD COLUMN deleted_at TIMESTAMP NULL AFTER duration_ms,
  ADD COLUMN deleted_by BIGINT UNSIGNED NULL AFTER deleted_at,
  ADD INDEX idx_generations_deleted_at (deleted_at),
  ADD CONSTRAINT fk_generations_deleted_by
    FOREIGN KEY (deleted_by)
    REFERENCES users (id)
    ON DELETE SET NULL;
