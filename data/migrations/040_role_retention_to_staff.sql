-- Rename legacy role value "retention" → "staff".
UPDATE users SET role = 'staff' WHERE role = 'retention';
UPDATE user_invites SET role = 'staff' WHERE role = 'retention';
