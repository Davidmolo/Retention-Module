-- Per-driver SMS thread log (Retention + Driver Comms).
-- Outbound survey/occasion/broadcast and inbound replies land here.

CREATE TABLE IF NOT EXISTS driver_sms_messages (
  id VARCHAR(32) PRIMARY KEY,
  driver_id BIGINT NOT NULL,
  direction ENUM('outbound', 'inbound') NOT NULL,
  body TEXT NOT NULL,
  phone VARCHAR(32) NULL,
  provider VARCHAR(32) NULL,
  provider_message_id VARCHAR(128) NULL,
  source VARCHAR(64) NOT NULL DEFAULT 'manual',
  sent_by VARCHAR(128) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_driver_sms_driver_created (driver_id, created_at),
  KEY idx_driver_sms_phone (phone),
  KEY idx_driver_sms_provider_msg (provider_message_id)
);
