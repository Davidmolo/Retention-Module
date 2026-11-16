CREATE TABLE IF NOT EXISTS running_balance_week_adjustments (
  year SMALLINT NOT NULL,
  week TINYINT NOT NULL,
  for_sale DECIMAL(12,2) NULL,
  ready_abandoned_shop DECIMAL(12,2) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (year, week)
);
