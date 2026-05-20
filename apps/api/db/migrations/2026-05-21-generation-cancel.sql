ALTER TABLE generations
  MODIFY COLUMN status ENUM('pending', 'processing', 'succeeded', 'failed', 'cancelled') NOT NULL DEFAULT 'pending';

ALTER TABLE credit_transactions
  MODIFY COLUMN type ENUM('initial_grant', 'admin_adjustment', 'generation_debit', 'generation_refund', 'redeem_code_credit', 'generation_cancel_refund') NOT NULL;
