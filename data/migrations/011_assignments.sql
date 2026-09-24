-- Driver ↔ truck assignments from the OpenRoad TMS assignments API.
-- One row per assignment id. `driver_id` -> drivers, and when assignment_type =
-- 'Truck', `truck_id` (= the API's assignment_id) -> trucks. A current assignment
-- has end_date IS NULL.
CREATE TABLE IF NOT EXISTS assignments (
  id BIGINT PRIMARY KEY,               -- OpenRoad assignment id
  driver_id BIGINT NULL,               -- -> drivers.id
  assignment_type VARCHAR(32) NULL,    -- 'Truck', …
  assignment_ref_id BIGINT NULL,       -- API assignment_id (assigned entity id)
  truck_id BIGINT NULL,                -- -> trucks.id (when type = 'Truck')
  start_date DATETIME NULL,
  end_date DATETIME NULL,              -- NULL = currently assigned
  source_created_at DATETIME NULL,
  source_updated_at DATETIME NULL,
  synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_assign_driver (driver_id),
  KEY idx_assign_truck (truck_id),
  KEY idx_assign_end (end_date),
  CONSTRAINT fk_assign_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE SET NULL,
  CONSTRAINT fk_assign_truck FOREIGN KEY (truck_id) REFERENCES trucks(id) ON DELETE SET NULL
);
