-- Snapshot compensation name + linehaul % onto each weekly report row.
ALTER TABLE gross_profit_reports
  ADD COLUMN compensation_name VARCHAR(128) NULL AFTER unit,
  ADD COLUMN linehaul_pct DECIMAL(8,4) NULL AFTER compensation_name;
