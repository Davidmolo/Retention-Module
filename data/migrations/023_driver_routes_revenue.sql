-- Add driver_routes.revenue when missing (prod table may predate column).
SET @exist := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'driver_routes'
     AND COLUMN_NAME = 'revenue'
);
SET @sql := IF(
  @exist = 0,
  'ALTER TABLE driver_routes ADD COLUMN revenue DECIMAL(12,2) NULL AFTER duration_empty',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
