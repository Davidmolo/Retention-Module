-- Track whether a survey response was submitted by the real driver (SMS link)
-- or by an admin opening the link from the driver detail page (testing).
ALTER TABLE retention_survey_responses
  ADD COLUMN submitted_by ENUM('driver','admin') NOT NULL DEFAULT 'driver'
  AFTER branch;
