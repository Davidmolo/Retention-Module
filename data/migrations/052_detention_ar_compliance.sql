-- Accounts Receivable 48h follow-up on a detention thread.
-- Scored only after a dispatcher or Art has answered.
SET @db := DATABASE();

SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = @db AND table_name = 'detentions' AND column_name = 'ar_replied_at'
    ),
    'SELECT 1',
    'ALTER TABLE detentions ADD COLUMN ar_replied_at DATETIME(3) NULL AFTER dispatcher_compliance_checked_at'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = @db AND table_name = 'detentions' AND column_name = 'ar_compliance'
    ),
    'SELECT 1',
    'ALTER TABLE detentions ADD COLUMN ar_compliance VARCHAR(16) NULL AFTER ar_replied_at'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = @db AND table_name = 'detentions' AND column_name = 'ar_compliance_checked_at'
    ),
    'SELECT 1',
    'ALTER TABLE detentions ADD COLUMN ar_compliance_checked_at DATETIME(3) NULL AFTER ar_compliance'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.statistics
       WHERE table_schema = @db AND table_name = 'detentions' AND index_name = 'idx_detentions_ar_compliance'
    ),
    'SELECT 1',
    'CREATE INDEX idx_detentions_ar_compliance ON detentions (ar_compliance)'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
