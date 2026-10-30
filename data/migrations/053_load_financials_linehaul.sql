-- OpenRoad load_financials carries the linehaul and the detention the customer paid.
-- The loads list does not include those amounts.
ALTER TABLE load_financials
  ADD COLUMN linehaul_rate DECIMAL(12, 2) NULL AFTER deductions_sum,
  ADD COLUMN fuel_surcharge DECIMAL(12, 2) NULL AFTER linehaul_rate,
  ADD COLUMN detention_sum DECIMAL(12, 2) NULL AFTER fuel_surcharge,
  ADD COLUMN total DECIMAL(12, 2) NULL AFTER detention_sum;
