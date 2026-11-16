-- Second (helper) driver on multi-driver loads — id from driver_routes, not loads.driver_id.
SET @exist := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'loads'
     AND COLUMN_NAME = 'helper_driver_id'
);
SET @sql := IF(
  @exist = 0,
  'ALTER TABLE loads ADD COLUMN helper_driver_id BIGINT NULL AFTER driver_count',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE loads l
   SET helper_driver_id = CASE
         WHEN COALESCE(l.driver_count, 0) < 2 THEN NULL
         ELSE (
           SELECT dr.driver_id
             FROM driver_routes dr
            WHERE dr.load_id = l.id
              AND dr.driver_id IS NOT NULL
              AND (l.driver_id IS NULL OR dr.driver_id <> l.driver_id)
            ORDER BY COALESCE(dr.loaded_miles, 0) DESC, dr.id
            LIMIT 1
         )
       END;
