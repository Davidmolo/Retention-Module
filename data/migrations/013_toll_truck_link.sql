-- Link tolls to trucks: toll_transactions.truck_id -> trucks.id where the truck's
-- unit matches the toll's vehicle_number. (trucks has `unit`, not `unit_id`.)
ALTER TABLE toll_transactions
  ADD COLUMN truck_id BIGINT NULL,
  ADD CONSTRAINT fk_toll_truck FOREIGN KEY (truck_id) REFERENCES trucks(id) ON DELETE SET NULL;

UPDATE toll_transactions tt
   JOIN trucks t ON t.unit = tt.vehicle_number
    SET tt.truck_id = t.id;
