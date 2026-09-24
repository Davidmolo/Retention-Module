-- Snapshot driver roster fields onto each weekly report row.
-- AFTER is valid only on ALTER TABLE (not CREATE TABLE).
ALTER TABLE gross_profit_reports
  ADD COLUMN driver_status VARCHAR(32) NULL AFTER driver_name;

ALTER TABLE gross_profit_reports
  ADD COLUMN driver_type VARCHAR(32) NULL AFTER driver_status;
