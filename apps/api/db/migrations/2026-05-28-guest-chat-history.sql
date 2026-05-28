ALTER TABLE chat_conversations
  MODIFY user_id BIGINT UNSIGNED NULL,
  ADD COLUMN guest_session_id BIGINT UNSIGNED NULL AFTER user_id,
  ADD INDEX idx_chat_conversations_guest_status_last_message (guest_session_id, status, last_message_at),
  ADD CONSTRAINT fk_chat_conversations_guest_session
    FOREIGN KEY (guest_session_id)
    REFERENCES guest_sessions (id)
    ON DELETE CASCADE;

ALTER TABLE chat_messages
  MODIFY user_id BIGINT UNSIGNED NULL,
  ADD COLUMN guest_session_id BIGINT UNSIGNED NULL AFTER user_id,
  ADD INDEX idx_chat_messages_guest_created (guest_session_id, created_at),
  ADD CONSTRAINT fk_chat_messages_guest_session
    FOREIGN KEY (guest_session_id)
    REFERENCES guest_sessions (id)
    ON DELETE CASCADE;
