-- Dispatcher compliance tracking (48h reply to detention thread).
-- Add columns only if missing (safe re-run / partial applies).
SET @db := DATABASE();

SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = @db AND table_name = 'detentions' AND column_name = 'dispatcher_email'
    ),
    'SELECT 1',
    'ALTER TABLE detentions ADD COLUMN dispatcher_email VARCHAR(255) NULL AFTER dispatcher'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = @db AND table_name = 'detentions' AND column_name = 'dispatcher_replied_at'
    ),
    'SELECT 1',
    'ALTER TABLE detentions ADD COLUMN dispatcher_replied_at DATETIME(3) NULL AFTER last_reply_at'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = @db AND table_name = 'detentions' AND column_name = 'dispatcher_compliance'
    ),
    'SELECT 1',
    'ALTER TABLE detentions ADD COLUMN dispatcher_compliance VARCHAR(16) NULL AFTER dispatcher_replied_at'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = @db AND table_name = 'detentions' AND column_name = 'dispatcher_compliance_checked_at'
    ),
    'SELECT 1',
    'ALTER TABLE detentions ADD COLUMN dispatcher_compliance_checked_at DATETIME(3) NULL AFTER dispatcher_compliance'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.statistics
       WHERE table_schema = @db AND table_name = 'detentions' AND index_name = 'idx_detentions_dispatcher_compliance'
    ),
    'SELECT 1',
    'CREATE INDEX idx_detentions_dispatcher_compliance ON detentions (dispatcher_compliance)'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.statistics
       WHERE table_schema = @db AND table_name = 'detentions' AND index_name = 'idx_detentions_email_date'
    ),
    'SELECT 1',
    'CREATE INDEX idx_detentions_email_date ON detentions (email_date)'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
