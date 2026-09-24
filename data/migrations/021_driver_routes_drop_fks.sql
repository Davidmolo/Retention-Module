-- driver_routes often arrive before a matching loads or drivers row
-- Keep indexes and drop foreign keys so upserts are not skipped
ALTER TABLE driver_routes DROP FOREIGN KEY fk_driver_routes_load;
ALTER TABLE driver_routes DROP FOREIGN KEY fk_driver_routes_driver;
