-- Prepass API exitDateTime. Week bucketing prefers COALESCE(exit_date, post_date).
ALTER TABLE toll_transactions
  ADD COLUMN exit_date DATETIME NULL AFTER post_date;

CREATE INDEX idx_toll_exit_date ON toll_transactions (exit_date);
