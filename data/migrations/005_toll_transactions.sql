-- Prepass toll transactions (source for the PREPASS expense line).
-- Synced daily from the Prepass API (lib/prepass). One row per tollId; the
-- PREPASS amount is SUM(toll_charge) grouped by vehicle_number for a period.
CREATE TABLE IF NOT EXISTS toll_transactions (
  toll_id BIGINT PRIMARY KEY,          -- tollId from the API (unique)
  account_number BIGINT NULL,
  account_name VARCHAR(255) NULL,
  post_date DATETIME NULL,             -- postDateTime
  invoice_date DATETIME NULL,          -- invoiceDateTime
  vehicle_number VARCHAR(32) NULL,
  device_number VARCHAR(64) NULL,
  toll_agency_code VARCHAR(32) NULL,
  toll_agency_name VARCHAR(128) NULL,
  toll_agency_state VARCHAR(8) NULL,
  exit_plaza_name VARCHAR(160) NULL,
  toll_class VARCHAR(16) NULL,
  toll_charge DECIMAL(10,4) NULL,
  toll_category VARCHAR(32) NULL,
  imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_toll_vehicle (vehicle_number),
  KEY idx_toll_post_date (post_date)
);
