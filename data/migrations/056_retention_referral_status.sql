-- First and last name, plus hire status, on driver referrals.

ALTER TABLE retention_driver_referrals
  ADD COLUMN first_name VARCHAR(80) NULL AFTER survey_response_id,
  ADD COLUMN last_name VARCHAR(80) NULL AFTER first_name,
  ADD COLUMN status ENUM('Open','Hired','Not Hired') NOT NULL DEFAULT 'Open' AFTER relationship;
