-- Occasion sends: birthday / hire-anniversary / holiday greetings
-- (wish SMS + survey link). Dedupes one send per driver per occasion key.

CREATE TABLE IF NOT EXISTS retention_occasion_sends (
  id VARCHAR(32) PRIMARY KEY,
  driver_id BIGINT NOT NULL,
  occasion_type ENUM('birthday','anniversary','holiday') NOT NULL,
  occasion_key VARCHAR(64) NOT NULL,
  holiday_name VARCHAR(64) NULL,
  survey_occurrence_id VARCHAR(32) NULL,
  message_body TEXT NULL,
  sent_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_ret_occasion (driver_id, occasion_type, occasion_key),
  KEY idx_ret_occasion_sent (sent_at),
  CONSTRAINT fk_ret_occasion_survey FOREIGN KEY (survey_occurrence_id)
    REFERENCES retention_survey_occurrences(id) ON DELETE SET NULL
);
