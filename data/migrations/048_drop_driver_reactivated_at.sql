-- Undo vacation-return stamp if 047 was already applied (pending Mantas decision).
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'drivers'
    AND COLUMN_NAME = 'reactivated_at'
);
SET @sql := IF(@col > 0, 'ALTER TABLE drivers DROP COLUMN reactivated_at', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
