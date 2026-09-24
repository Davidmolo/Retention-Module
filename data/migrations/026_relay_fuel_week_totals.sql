-- Per-driver weekly fuel totals from the Relay TMS Fuel API.
-- Company drivers still use .dat PPG. OO report prefers these when present.
CREATE TABLE IF NOT EXISTS relay_fuel_week_totals (
  driver_id BIGINT NOT NULL,
  year SMALLINT NOT NULL,
  week TINYINT NOT NULL,
  amount_retail DECIMAL(12,2) NOT NULL DEFAULT 0,
  amount_paid DECIMAL(12,2) NOT NULL DEFAULT 0,
  amount_saved DECIMAL(12,2) NOT NULL DEFAULT 0,
  gallons DECIMAL(12,3) NULL,
  txn_count INT NOT NULL DEFAULT 0,
  synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (driver_id, year, week),
  CONSTRAINT fk_rfwt_driver FOREIGN KEY (driver_id)
    REFERENCES drivers(id) ON DELETE CASCADE,
  KEY idx_rfwt_week (year, week)
);
