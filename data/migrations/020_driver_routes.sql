-- OpenRoad TMS driver_routes — per-driver segment miles on a load.
-- Map / join on driver_id + load_id. Week bucket: source_updated_at / source_created_at.
-- revenue is allocated at sync from loads.revenue × (loaded_miles / loads.miles).
CREATE TABLE IF NOT EXISTS driver_routes (
  id BIGINT PRIMARY KEY,                    -- OpenRoad driver_route id
  load_id BIGINT NULL,
  driver_id BIGINT NULL,
  destination_from_id BIGINT NULL,
  destination_to_id BIGINT NULL,
  position_from INT NULL,
  position_to INT NULL,
  route_type VARCHAR(64) NULL,
  toll_discouraged TINYINT(1) NULL,
  loaded_miles DECIMAL(12,3) NULL,
  empty_miles DECIMAL(12,3) NULL,
  duration_loaded DECIMAL(12,2) NULL,       -- minutes (API value)
  duration_empty DECIMAL(12,2) NULL,
  revenue DECIMAL(12,2) NULL,               -- share of load total by loaded miles
  source_created_at DATETIME NULL,
  source_updated_at DATETIME NULL,
  synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_driver_routes_load (load_id),
  KEY idx_driver_routes_driver (driver_id),
  KEY idx_driver_routes_driver_load (driver_id, load_id),
  KEY idx_driver_routes_updated (source_updated_at),
  KEY idx_driver_routes_created (source_created_at),
  CONSTRAINT fk_driver_routes_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE SET NULL,
  CONSTRAINT fk_driver_routes_load FOREIGN KEY (load_id) REFERENCES loads(id) ON DELETE SET NULL
);
