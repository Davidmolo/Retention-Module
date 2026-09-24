-- OpenRoad TMS drivers (source table). Synced from the OpenRoad API
-- (lib/openroad). One row per TMS driver id; upserted on each sync.
-- NOTE: soc_sec_no is SSN (sensitive PII) — consider dropping or encrypting it.
CREATE TABLE IF NOT EXISTS tms_drivers (
  id BIGINT PRIMARY KEY,               -- OpenRoad TMS driver id
  first_name VARCHAR(128) NULL,
  last_name VARCHAR(128) NULL,
  middle_name VARCHAR(128) NULL,
  driver_nr VARCHAR(64) NULL,
  status VARCHAR(32) NULL,
  driver_type VARCHAR(64) NULL,
  tax_type VARCHAR(64) NULL,
  fleet_group VARCHAR(64) NULL,
  manager_id BIGINT NULL,
  substitute_manager_id BIGINT NULL,
  compensation_id BIGINT NULL,
  payroll_schedule_id BIGINT NULL,
  phone VARCHAR(64) NULL,
  email VARCHAR(255) NULL,
  soc_sec_no VARCHAR(64) NULL,
  cdl VARCHAR(64) NULL,
  cdl_state VARCHAR(16) NULL,
  address VARCHAR(255) NULL,
  city VARCHAR(128) NULL,
  state_code VARCHAR(16) NULL,
  zipcode VARCHAR(16) NULL,
  dob DATE NULL,
  cdl_expire_date DATE NULL,
  date_added DATE NULL,
  date_removed DATE NULL,
  source_created_at DATETIME NULL,     -- created_at from the API
  source_updated_at DATETIME NULL,     -- updated_at from the API
  synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_tms_drivers_updated (source_updated_at),
  KEY idx_tms_drivers_status (status),
  KEY idx_tms_drivers_nr (driver_nr)
);
