-- Persisted weekly Gross Profit report — one row per driver per week, computed
-- and stored by the scheduled job (scripts/generate-report.mjs) so the sheet is
-- served from the DB, not recomputed at runtime.
CREATE TABLE IF NOT EXISTS gross_profit_reports (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  year SMALLINT NOT NULL,
  week TINYINT NOT NULL,
  driver_id BIGINT NOT NULL,
  driver_name VARCHAR(128) NULL,
  trips INT NULL,
  rate DECIMAL(10,4) NULL,
  mileage DECIMAL(12,2) NULL,
  gross_income DECIMAL(12,2) NULL,
  drivers_pay DECIMAL(12,2) NULL,
  fuel DECIMAL(12,2) NULL,
  fuel_mpg DECIMAL(8,2) NULL,
  fuel_ppg DECIMAL(8,4) NULL,
  prepass DECIMAL(12,2) NULL,
  monitoring_logs DECIMAL(12,2) NULL,
  rm DECIMAL(12,2) NULL,
  equipment_lease DECIMAL(12,2) NULL,
  equipment_lease2 DECIMAL(12,2) NULL,
  liability_insurance DECIMAL(12,2) NULL,
  scale DECIMAL(12,2) NULL,
  factoring_fee DECIMAL(12,2) NULL,
  samsara DECIMAL(12,2) NULL,
  cargo_insurance DECIMAL(12,2) NULL,
  pd_insurance DECIMAL(12,2) NULL,
  total_expenses DECIMAL(12,2) NULL,
  gross_profit DECIMAL(12,2) NULL,
  generated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_gpr (year, week, driver_id),
  KEY idx_gpr_week (year, week)
);
