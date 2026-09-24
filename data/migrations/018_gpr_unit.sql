-- Unit on the weekly report stores the assigned truck's trucks.unit for that week.
ALTER TABLE gross_profit_reports
  ADD COLUMN unit VARCHAR(64) NULL AFTER driver_type;
