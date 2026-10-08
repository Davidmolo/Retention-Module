-- OAuth tokens for reading ar@ (Detention email intake).
CREATE TABLE IF NOT EXISTS detention_gmail_oauth (
  id TINYINT PRIMARY KEY DEFAULT 1,
  email VARCHAR(255) NOT NULL,
  refresh_token TEXT NOT NULL,
  access_token TEXT NULL,
  access_token_expires_at DATETIME(3) NULL,
  scope TEXT NULL,
  connected_by VARCHAR(255) NULL,
  connected_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
);
