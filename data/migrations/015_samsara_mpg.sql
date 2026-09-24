-- Samsara fuel-efficiency (MPG) weekly snapshots, per vehicle and per driver.
-- Synced from the Samsara fuel-energy reports. One row per Samsara entity per week.
CREATE TABLE IF NOT EXISTS samsara_vehicle_mpg (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  samsara_vehicle_id VARCHAR(64) NOT NULL,
  vehicle_name VARCHAR(64) NULL,
  truck_id BIGINT NULL,                -- linked: vehicle_name = trucks.unit
  year SMALLINT NOT NULL,
  week TINYINT NOT NULL,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  efficiency_mpge DECIMAL(8,2) NULL,   -- MPG (fuel) / MPGE (hybrid/electric)
  fuel_consumed_ml BIGINT NULL,
  distance_meters BIGINT NULL,
  energy_type VARCHAR(16) NULL,
  synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_veh_week (samsara_vehicle_id, year, week),
  KEY idx_svmpg_truck (truck_id),
  CONSTRAINT fk_svmpg_truck FOREIGN KEY (truck_id) REFERENCES trucks(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS samsara_driver_mpg (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  samsara_driver_id VARCHAR(64) NOT NULL,
  driver_name VARCHAR(128) NULL,
  driver_id BIGINT NULL,               -- linked by name to drivers
  year SMALLINT NOT NULL,
  week TINYINT NOT NULL,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  efficiency_mpge DECIMAL(8,2) NULL,
  fuel_consumed_ml BIGINT NULL,
  distance_meters BIGINT NULL,
  synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_drv_week (samsara_driver_id, year, week),
  KEY idx_sdmpg_driver (driver_id),
  CONSTRAINT fk_sdmpg_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE SET NULL
);
