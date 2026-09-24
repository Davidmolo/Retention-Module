-- OpenRoad TMS users (dispatchers / managers / staff).
-- Synced from GET /api/ext/v1/users. drivers.manager_id → tms_users.id
CREATE TABLE IF NOT EXISTS tms_users (
  id BIGINT PRIMARY KEY,
  first_name VARCHAR(128) NULL,
  last_name VARCHAR(128) NULL,
  user_type VARCHAR(64) NULL,
  status VARCHAR(32) NULL,
  email VARCHAR(255) NULL,
  phone VARCHAR(64) NULL,
  office VARCHAR(128) NULL,
  team VARCHAR(128) NULL,
  source_created_at DATETIME NULL,
  source_updated_at DATETIME NULL,
  synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_tms_users_status (status),
  KEY idx_tms_users_type (user_type),
  KEY idx_tms_users_email (email)
);
