-- User roles for module access control.
-- admin     = full app (Dashboard, Gross Profit, Retention, …)
-- retention = Retention module only
ALTER TABLE users
  ADD COLUMN role VARCHAR(32) NOT NULL DEFAULT 'admin'
    AFTER password_hash;

UPDATE users SET role = 'admin' WHERE role IS NULL OR role = '';
