-- OpenRoad TMS compensations (driver pay structures). Synced daily.
-- drivers.compensation_id (already present) references compensations.id.
CREATE TABLE IF NOT EXISTS compensations (
  id BIGINT PRIMARY KEY,               -- OpenRoad compensation id
  name VARCHAR(128) NULL,
  status VARCHAR(32) NULL,             -- 'Per Mile' | 'Percentage' | 'Flat'
  loaded_mile_rate DECIMAL(10,4) NULL,
  empty_mile_rate DECIMAL(10,4) NULL,
  banded BOOLEAN NULL,
  linehaul_percentage DECIMAL(8,4) NULL,        -- percent (e.g. 92.0 = 92%)
  fuel_surcharge_percentage DECIMAL(8,4) NULL,
  flat_status VARCHAR(32) NULL,        -- 'Daily' | 'Hourly' | …
  flat_rate DECIMAL(12,4) NULL,
  seniority_bonus_enabled BOOLEAN NULL,
  seniority_bonus_cents_per_mile_per_year DECIMAL(10,4) NULL,
  seniority_bonus_excluded_event_reasons JSON NULL,
  source_created_at DATETIME NULL,
  source_updated_at DATETIME NULL,
  synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
