-- Pending user invites (email link → set password → account created).
CREATE TABLE IF NOT EXISTS user_invites (
  id INT PRIMARY KEY AUTO_INCREMENT,
  token VARCHAR(64) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(32) NOT NULL,
  modules_json TEXT NOT NULL,
  invited_by INT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  expires_at DATETIME(3) NOT NULL,
  accepted_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_user_invites_email (email),
  INDEX idx_user_invites_status (status)
);
