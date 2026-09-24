-- OpenRoad /load_financials — money view + driver accessorial pay (payroll week).
CREATE TABLE IF NOT EXISTS load_financials (
  id BIGINT NOT NULL PRIMARY KEY,
  load_id BIGINT NOT NULL,
  customer_id BIGINT NULL,
  status VARCHAR(64) NULL,
  lumper_sum DECIMAL(12, 2) NULL,
  storage_sum DECIMAL(12, 2) NULL,
  misc_sum DECIMAL(12, 2) NULL,
  deductions_sum DECIMAL(12, 2) NULL,
  source_created_at DATETIME NULL,
  source_updated_at DATETIME NULL,
  synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_lf_load (load_id),
  KEY idx_lf_updated (source_updated_at)
);

CREATE TABLE IF NOT EXISTS driver_accessorials (
  id BIGINT NOT NULL PRIMARY KEY,
  load_id BIGINT NOT NULL,
  driver_id BIGINT NULL,
  amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  category VARCHAR(64) NULL,
  note TEXT NULL,
  settlement_status VARCHAR(32) NULL,
  settlement_week_start DATE NULL,
  settlement_week_end DATE NULL,
  settlement_date DATE NULL,
  source_created_at DATETIME NULL,
  synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_da_driver_week (driver_id, settlement_week_start, settlement_week_end),
  KEY idx_da_load (load_id)
);
