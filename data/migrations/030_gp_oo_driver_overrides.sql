-- Per-OO driver overrides (equipment lease, PD, liability credit, XXII fee %).
CREATE TABLE IF NOT EXISTS gp_oo_driver_overrides (
  driver_id BIGINT NOT NULL PRIMARY KEY,
  driver_name VARCHAR(255) NOT NULL,
  equipment_lease DECIMAL(12,2) NULL,
  pd_insurance DECIMAL(12,2) NULL,
  liability_credit DECIMAL(12,2) NULL,
  xxii_fee_pct DECIMAL(8,4) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_gp_oo_override_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE
);

-- Seed known OO named overrides from previous hardcoded maps.
INSERT INTO gp_oo_driver_overrides
  (driver_id, driver_name, equipment_lease, pd_insurance, liability_credit, xxii_fee_pct)
SELECT d.id,
       TRIM(CONCAT_WS(' ', d.first_name, d.middle_name, d.last_name)),
       CASE
         WHEN LOWER(d.first_name) = 'cheryl' AND LOWER(d.last_name) = 'day' THEN -160
         ELSE NULL
       END,
       CASE
         WHEN LOWER(d.first_name) = 'cheryl' AND LOWER(d.last_name) = 'day' THEN 49
         WHEN LOWER(d.first_name) = 'robert' AND LOWER(d.last_name) = 'wagner' THEN 49
         WHEN LOWER(d.first_name) = 'donald' AND LOWER(d.last_name) = 'smith' THEN 162
         ELSE NULL
       END,
       CASE
         WHEN LOWER(d.first_name) = 'cheryl' AND LOWER(d.last_name) = 'day' THEN 225
         WHEN LOWER(d.first_name) = 'robert' AND LOWER(d.last_name) = 'wagner' THEN 225
         WHEN LOWER(d.first_name) = 'donald' AND LOWER(d.last_name) = 'smith' THEN 252
         ELSE NULL
       END,
       NULL
  FROM drivers d
 WHERE (
         (LOWER(d.first_name) = 'cheryl' AND LOWER(d.last_name) = 'day')
      OR (LOWER(d.first_name) = 'robert' AND LOWER(d.last_name) = 'wagner')
      OR (LOWER(d.first_name) = 'donald' AND LOWER(d.last_name) = 'smith')
       )
ON DUPLICATE KEY UPDATE driver_name = VALUES(driver_name);
