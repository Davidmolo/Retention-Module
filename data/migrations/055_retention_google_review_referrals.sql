-- Drivers sent to the Google review page, and referrals from a 4 or 5 star survey.

CREATE TABLE IF NOT EXISTS retention_google_review_sends (
  id VARCHAR(32) PRIMARY KEY,
  driver_id BIGINT NOT NULL,
  survey_response_id VARCHAR(32) NOT NULL,
  sent_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_ret_google_response (survey_response_id),
  KEY idx_ret_google_driver (driver_id)
);

CREATE TABLE IF NOT EXISTS retention_driver_referrals (
  id VARCHAR(32) PRIMARY KEY,
  driver_id BIGINT NOT NULL,
  survey_response_id VARCHAR(32) NOT NULL,
  full_name VARCHAR(120) NOT NULL,
  phone VARCHAR(32) NOT NULL,
  relationship VARCHAR(80) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_ret_referral_driver (driver_id),
  KEY idx_ret_referral_response (survey_response_id)
);
