-- Replace the derived drivers roster with the TMS drivers, and rename the TMS
-- source tables to be the canonical drivers/trucks tables.
-- fuel_transactions/trips linked to the OLD roster ids; those FKs are dropped,
-- the links nulled, and re-added against the new (TMS-id) drivers. The name-based
-- re-link is done by scripts/backfill-drivers.mjs afterward.
ALTER TABLE fuel_transactions DROP FOREIGN KEY fk_ftx_driver;
ALTER TABLE trips DROP FOREIGN KEY fk_trips_driver;
DROP TABLE drivers;
RENAME TABLE tms_drivers TO drivers, tms_trucks TO trucks;
UPDATE fuel_transactions SET driver_id = NULL;
UPDATE trips SET driver_id = NULL;
ALTER TABLE fuel_transactions
  ADD CONSTRAINT fk_ftx_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE SET NULL;
ALTER TABLE trips
  ADD CONSTRAINT fk_trips_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE SET NULL;
