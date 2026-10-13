-- When OpenRoad flips a driver from suspended/inactive → active (e.g. back from
-- vacation), stamp reactivated_at so Retention can wait before SMS.

ALTER TABLE drivers
  ADD COLUMN reactivated_at DATETIME(3) NULL
    AFTER date_removed;
