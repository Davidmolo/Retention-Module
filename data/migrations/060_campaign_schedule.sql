ALTER TABLE driver_comms_campaigns
  ADD COLUMN scheduled_at DATETIME(3) NULL,
  ADD COLUMN status VARCHAR(16) NOT NULL DEFAULT 'sent',
  ADD COLUMN driver_ids_json TEXT NULL;
