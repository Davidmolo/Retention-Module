-- Super Admin role support + per-user module grants + display name.
-- role values: super_admin | admin | retention
ALTER TABLE users
  ADD COLUMN display_name VARCHAR(255) NULL AFTER role,
  ADD COLUMN modules_json TEXT NULL AFTER display_name;
