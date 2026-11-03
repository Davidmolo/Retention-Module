-- Per-driver weekly diesel totals from OpenRoad /fuel_card_transactions.
-- Company Net P/G = diesel_net / diesel_gallons (matches OR Fuel card UI).
CREATE TABLE IF NOT EXISTS openroad_fuel_week_totals (
  driver_id BIGINT NOT NULL,
  year SMALLINT NOT NULL,
  week TINYINT NOT NULL,
  diesel_gallons DECIMAL(12,3) NOT NULL DEFAULT 0,
  diesel_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount DECIMAL(12,2) NOT NULL DEFAULT 0,
  diesel_net DECIMAL(12,2) NOT NULL DEFAULT 0,
  txn_count INT NOT NULL DEFAULT 0,
  synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (driver_id, year, week),
  CONSTRAINT fk_ofwt_driver FOREIGN KEY (driver_id)
    REFERENCES drivers(id) ON DELETE CASCADE,
  KEY idx_ofwt_week (year, week)
);
