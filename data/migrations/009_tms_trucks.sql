-- OpenRoad TMS trucks (source table). Synced daily from the OpenRoad API.
-- One row per TMS truck id; upserted on each sync.
CREATE TABLE IF NOT EXISTS tms_trucks (
  id BIGINT PRIMARY KEY,               -- OpenRoad TMS truck id
  unit VARCHAR(32) NULL,
  status VARCHAR(32) NULL,
  make VARCHAR(64) NULL,
  model VARCHAR(64) NULL,
  year SMALLINT NULL,
  vin VARCHAR(32) NULL,
  license_plate VARCHAR(32) NULL,
  state_code VARCHAR(16) NULL,
  ownership_type VARCHAR(32) NULL,
  color VARCHAR(32) NULL,
  insured_value DECIMAL(12,2) NULL,
  oos BOOLEAN NULL,                    -- out of service
  needs_repair BOOLEAN NULL,
  slip_seating BOOLEAN NULL,
  oos_note VARCHAR(500) NULL,
  needs_repair_note VARCHAR(500) NULL,
  irp BOOLEAN NULL,
  lease BOOLEAN NULL,
  samsara_dev_id VARCHAR(64) NULL,
  monthly_insurance_cost DECIMAL(12,2) NULL,
  total_insurance_cost DECIMAL(12,2) NULL,
  cost DECIMAL(12,2) NULL,
  monthly_payment DECIMAL(12,2) NULL,
  interest DECIMAL(7,3) NULL,
  acquisition_date DATE NULL,
  annual_inspection_date DATE NULL,
  irp_expiration_date DATE NULL,
  ins_expiration_date DATE NULL,
  irp_add_date DATE NULL,
  irp_remove_date DATE NULL,
  quarterly_maintenance_date DATE NULL,
  source_created_at DATETIME NULL,     -- created_at from the API
  source_updated_at DATETIME NULL,     -- updated_at from the API
  synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_tms_trucks_unit (unit),
  KEY idx_tms_trucks_status (status),
  KEY idx_tms_trucks_updated (source_updated_at)
);
