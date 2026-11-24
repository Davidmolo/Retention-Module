CREATE TABLE IF NOT EXISTS driver_comms_campaigns (
  id VARCHAR(32) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  created_by_user_id INT NOT NULL,
  created_by_name VARCHAR(255) NOT NULL,
  notify_email VARCHAR(255) NULL,
  sent_count INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS driver_comms_campaign_recipients (
  campaign_id VARCHAR(32) NOT NULL,
  driver_id VARCHAR(64) NOT NULL,
  PRIMARY KEY (campaign_id, driver_id),
  KEY idx_campaign_recipient_driver (driver_id, campaign_id)
);

CREATE TABLE IF NOT EXISTS driver_comms_campaign_replies (
  id VARCHAR(32) PRIMARY KEY,
  campaign_id VARCHAR(32) NOT NULL,
  driver_id VARCHAR(64) NOT NULL,
  body TEXT NOT NULL,
  seen_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_campaign_replies (campaign_id, seen_at)
);
