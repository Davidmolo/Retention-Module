-- Resolution follow-up surveys + survey kind on occurrences.

ALTER TABLE retention_survey_occurrences
  ADD COLUMN survey_kind ENUM('regular','resolution') NOT NULL DEFAULT 'regular'
    AFTER triggered_by,
  ADD COLUMN case_id VARCHAR(32) NULL
    AFTER survey_kind;

ALTER TABLE retention_survey_responses
  ADD COLUMN resolution_feedback JSON NULL
    AFTER department_feedback;
