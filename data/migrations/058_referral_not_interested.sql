ALTER TABLE retention_driver_referrals
  MODIFY COLUMN status ENUM('Open','Hired','Not Hired','Not interested') NOT NULL DEFAULT 'Open';

UPDATE retention_driver_referrals
   SET status = 'Not interested'
 WHERE status = 'Not Hired';

ALTER TABLE retention_driver_referrals
  MODIFY COLUMN status ENUM('Open','Hired','Not interested') NOT NULL DEFAULT 'Open';
