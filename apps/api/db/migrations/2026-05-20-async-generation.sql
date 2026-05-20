ALTER TABLE generations
  MODIFY status ENUM('pending', 'processing', 'succeeded', 'failed') NOT NULL DEFAULT 'pending',
  ADD COLUMN started_at TIMESTAMP NULL AFTER error_message,
  ADD COLUMN completed_at TIMESTAMP NULL AFTER started_at,
  ADD COLUMN duration_ms INT UNSIGNED NULL AFTER completed_at;

