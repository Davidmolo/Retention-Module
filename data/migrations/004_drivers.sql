-- Drivers roster (master). Populated by deriving from existing fuel/trip data
-- (scripts/backfill-drivers.mjs) and later the TMS sync. fuel_transactions and
-- trips link to it via a nullable driver_id FK.
CREATE TABLE IF NOT EXISTS drivers (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(128) NOT NULL,
  card_number VARCHAR(24) NULL,   -- fuel card (reliable link key) - one driver per card
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_drivers_card (card_number),
  KEY idx_drivers_name (name)
);

ALTER TABLE fuel_transactions
  ADD COLUMN driver_id BIGINT NULL,
  ADD CONSTRAINT fk_ftx_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE SET NULL;

ALTER TABLE trips
  ADD COLUMN driver_id BIGINT NULL,
  ADD CONSTRAINT fk_trips_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE SET NULL;
