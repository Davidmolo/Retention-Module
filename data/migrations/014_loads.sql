-- OpenRoad TMS loads (freight hauls) — the real source of per-driver miles &
-- revenue. driver_id is derived from the load's destinations (the driver who ran
-- it). Bucketed into weeks by delivery_at.
CREATE TABLE IF NOT EXISTS loads (
  id BIGINT PRIMARY KEY,               -- OpenRoad load id
  driver_id BIGINT NULL,               -- from destinations[].driver_id
  status VARCHAR(64) NULL,
  customer_name VARCHAR(255) NULL,
  gp_load VARCHAR(64) NULL,
  miles DECIMAL(10,2) NULL,            -- loaded miles
  empty_miles DECIMAL(10,2) NULL,
  revenue DECIMAL(12,2) NULL,          -- load `total`
  linehaul_rate DECIMAL(12,2) NULL,
  fuel_surcharge DECIMAL(12,2) NULL,
  pickup_at DATETIME NULL,             -- first_pu_time_from
  delivery_at DATETIME NULL,           -- last_del_time_to (week bucket)
  source_created_at DATETIME NULL,
  source_updated_at DATETIME NULL,
  synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_loads_driver (driver_id),
  KEY idx_loads_delivery (delivery_at),
  CONSTRAINT fk_loads_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE SET NULL
);
