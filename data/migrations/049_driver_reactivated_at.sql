-- When OpenRoad flips suspended/inactive → active (vacation return), stamp
-- reactivated_at so Retention waits like a new driver before SMS.

ALTER TABLE drivers
  ADD COLUMN reactivated_at DATETIME(3) NULL
    AFTER date_removed;
