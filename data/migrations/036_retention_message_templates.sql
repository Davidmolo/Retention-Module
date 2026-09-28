-- Editable Retention SMS message templates (Configure page).
CREATE TABLE IF NOT EXISTS retention_message_templates (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  body TEXT NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
);
