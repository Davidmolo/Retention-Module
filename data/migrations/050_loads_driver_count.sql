-- Distinct drivers on a load (from driver_routes). Used for solo vs multi split.
SET @exist := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'loads'
     AND COLUMN_NAME = 'driver_count'
);
SET @sql := IF(
  @exist = 0,
  'ALTER TABLE loads ADD COLUMN driver_count INT NOT NULL DEFAULT 0 AFTER driver_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE loads l
   SET driver_count = (
         SELECT COUNT(DISTINCT dr.driver_id)
           FROM driver_routes dr
          WHERE dr.load_id = l.id
            AND dr.driver_id IS NOT NULL
       );
