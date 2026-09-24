-- Global GP formula rates (R&M, liability, factoring). Key/value table.
-- Seed values match previous hardcoded defaults.
CREATE TABLE IF NOT EXISTS gp_config (
  config_key VARCHAR(64) NOT NULL PRIMARY KEY,
  config_value DECIMAL(12,6) NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO gp_config (config_key, config_value) VALUES
  ('company_rm_per_mile', 0.19),
  ('oo_rm_per_mile', 0.04),
  ('company_liability_per_mile', 0.15),
  ('oo_liability_per_mile', 0.15),
  ('oo_liability_flat', 16),
  ('factoring_rate', 0.012)
ON DUPLICATE KEY UPDATE config_key = config_key;
