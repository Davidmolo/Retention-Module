-- OO equipment lease default (was hardcoded -35 in GP_RATE_DEFAULTS).
INSERT INTO gp_config (config_key, config_value) VALUES
  ('oo_equipment_lease_default', -35)
ON DUPLICATE KEY UPDATE config_key = config_key;
