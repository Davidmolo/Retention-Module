-- Retail pre-discount fuel amount from .dat, plus OO report fuel split.
-- amount is paid with driver discount. amount_retail is without discount.
ALTER TABLE fuel_transactions
  ADD COLUMN amount_retail DECIMAL(12,2) NULL AFTER amount;

UPDATE fuel_transactions
   SET amount_retail = CAST(SUBSTRING(raw_record, 83, 7) AS UNSIGNED) / 100
 WHERE raw_record IS NOT NULL
   AND CHAR_LENGTH(raw_record) >= 90
   AND SUBSTRING(raw_record, 83, 7) REGEXP '^[0-9]{7}$';

ALTER TABLE gross_profit_reports
  ADD COLUMN fuel_gross DECIMAL(12,2) NULL AFTER fuel,
  ADD COLUMN fuel_discounted DECIMAL(12,2) NULL AFTER fuel_gross;
