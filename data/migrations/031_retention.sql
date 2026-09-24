-- Retention Module tables for Gross Profit (MySQL).
-- Drop into D:\grossProfit\data\migrations\ as the next number (e.g. 027_retention.sql).
-- Does NOT change Retention UI — only persistence for surveys / cases / notes.

CREATE TABLE IF NOT EXISTS retention_survey_occurrences (
  id VARCHAR(32) PRIMARY KEY,
  driver_id BIGINT NOT NULL,
  token VARCHAR(64) NOT NULL,
  scheduled_at DATETIME(3) NOT NULL,
  sent_at DATETIME(3) NULL,
  completed_at DATETIME(3) NULL,
  triggered_by ENUM('system','admin') NOT NULL DEFAULT 'admin',
  response_state ENUM('pending','sent','reminded','completed','non_response') NOT NULL DEFAULT 'pending',
  reminder_count INT NOT NULL DEFAULT 0,
  provider_message_id VARCHAR(128) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_ret_survey_token (token),
  KEY idx_ret_survey_driver (driver_id),
  KEY idx_ret_survey_state (response_state)
);

CREATE TABLE IF NOT EXISTS retention_survey_responses (
  id VARCHAR(32) PRIMARY KEY,
  driver_id BIGINT NOT NULL,
  survey_occurrence_id VARCHAR(32) NOT NULL,
  overall_rating TINYINT NOT NULL,
  general_comment TEXT NULL,
  department_feedback JSON NULL,
  branch ENUM('positive','at_risk') NOT NULL,
  submitted_at DATETIME(3) NOT NULL,
  KEY idx_ret_resp_driver (driver_id),
  KEY idx_ret_resp_occ (survey_occurrence_id),
  CONSTRAINT fk_ret_resp_occ FOREIGN KEY (survey_occurrence_id)
    REFERENCES retention_survey_occurrences(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS retention_cases (
  id VARCHAR(32) PRIMARY KEY,
  driver_id BIGINT NOT NULL,
  at_risk TINYINT(1) NOT NULL DEFAULT 1,
  status ENUM('Open','In Progress','Resolved','Completed') NOT NULL DEFAULT 'Open',
  source_survey_id VARCHAR(32) NULL,
  overall_rating TINYINT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  resolved_at DATETIME(3) NULL,
  KEY idx_ret_case_driver (driver_id),
  KEY idx_ret_case_status (status)
);

CREATE TABLE IF NOT EXISTS retention_internal_notes (
  id VARCHAR(32) PRIMARY KEY,
  driver_id BIGINT NOT NULL,
  case_id VARCHAR(32) NULL,
  author VARCHAR(128) NOT NULL DEFAULT 'Admin',
  body TEXT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_ret_notes_driver (driver_id)
);

CREATE TABLE IF NOT EXISTS retention_notification_logs (
  id VARCHAR(32) PRIMARY KEY,
  trigger_name VARCHAR(64) NOT NULL,
  recipient VARCHAR(255) NOT NULL,
  department VARCHAR(64) NULL,
  driver_id BIGINT NULL,
  survey_response_id VARCHAR(32) NULL,
  send_result JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_ret_notify_driver (driver_id)
);

CREATE TABLE IF NOT EXISTS retention_sms_opt_outs (
  id VARCHAR(32) PRIMARY KEY,
  phone VARCHAR(32) NOT NULL,
  opted_out TINYINT(1) NOT NULL DEFAULT 1,
  source VARCHAR(64) NOT NULL DEFAULT 'admin',
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_ret_opt_phone (phone)
);
