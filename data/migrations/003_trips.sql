-- Trips (loads) — source data for per-driver trip counts.
-- Populated by the TMS sync / an importer (see lib/sources/trips.ts).
-- The dashboard "Top by Trips" chart counts rows per driver from this table.
CREATE TABLE IF NOT EXISTS trips (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  external_id VARCHAR(64) NULL,        -- load/trip reference from the source system
  driver_name VARCHAR(128) NOT NULL,
  trip_date DATE NULL,
  origin VARCHAR(128) NULL,
  destination VARCHAR(128) NULL,
  miles DECIMAL(10,1) NULL,
  revenue DECIMAL(12,2) NULL,
  source VARCHAR(32) NULL,             -- 'tms' | 'import' | 'seed'
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_trips_external (external_id),
  KEY idx_trips_driver (driver_name),
  KEY idx_trips_date (trip_date)
);
