-- Intake audit log so every Gmail message is processed exactly once.
CREATE TABLE IF NOT EXISTS detention_gmail_intake_log (
  gmail_message_id VARCHAR(128) PRIMARY KEY,
  gmail_thread_id VARCHAR(128) NULL,
  detention_id VARCHAR(64) NULL,
  subject VARCHAR(512) NULL,
  result VARCHAR(32) NOT NULL,
  detail TEXT NULL,
  processed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_detention_gmail_intake_result (result),
  KEY idx_detention_gmail_intake_processed (processed_at)
);

-- Normalize empty message ids so a UNIQUE index can be added safely.
UPDATE detentions SET message_id = NULL WHERE message_id IS NOT NULL AND TRIM(message_id) = '';

-- Prevent duplicate claims from the same Gmail message.
-- Multiple NULLs remain allowed for older sheet imports.
-- (Skip if index already exists — migrate runner records file once.)
SET @idx_exists := (
  SELECT COUNT(1) FROM information_schema.statistics
   WHERE table_schema = DATABASE()
     AND table_name = 'detentions'
     AND index_name = 'uq_detentions_message_id'
);
SET @sql := IF(
  @idx_exists = 0,
  'ALTER TABLE detentions ADD UNIQUE INDEX uq_detentions_message_id (message_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
