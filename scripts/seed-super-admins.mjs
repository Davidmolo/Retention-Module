/**
 * Seed the David Super Admin account.
 *
 *   pnpm exec node scripts/seed-super-admins.mjs
 *
 * Optional: SEED_SUPER_DAVID_PASSWORD=...
 */
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

function genPassword(bytes = 12) {
  return crypto.randomBytes(bytes).toString('base64url').slice(0, 16);
}

const ALL_MODULES_JSON = JSON.stringify([
  'dashboard',
  'gross-profit',
  'retention',
  'detention',
]);

const davidPassword =
  process.env.SEED_SUPER_DAVID_PASSWORD?.trim() || genPassword();

const conn = await mysql.createConnection(url);
try {
  try {
    await conn.query(
      `ALTER TABLE users
         ADD COLUMN display_name VARCHAR(255) NULL AFTER role,
         ADD COLUMN modules_json TEXT NULL AFTER display_name`
    );
  } catch (e) {
    const msg = String(e?.message || e);
    if (!/Duplicate column/i.test(msg)) {
      console.warn('[seed-super-admins] alter skipped:', msg);
    }
  }

  const hash = await bcrypt.hash(davidPassword, 10);
  await conn.query(
    `INSERT INTO users (username, password_hash, role, display_name, modules_json)
     VALUES (?, ?, 'super_admin', 'David', ?)
     ON DUPLICATE KEY UPDATE
       password_hash = VALUES(password_hash),
       role = 'super_admin',
       display_name = VALUES(display_name),
       modules_json = VALUES(modules_json)`,
    ['david@goxxii.com', hash, ALL_MODULES_JSON]
  );

  // Keep shared admin login as Super Admin (password unchanged).
  await conn.query(
    `UPDATE users
     SET role = 'super_admin',
         modules_json = ?,
         display_name = COALESCE(NULLIF(display_name, ''), 'Admin')
     WHERE username = 'admin'`,
    [ALL_MODULES_JSON]
  );

  // Remove temporary developer Super Admin if present.
  await conn.query(
    `DELETE FROM users WHERE username = 'shahmeerahmed219@gmail.com'`
  );

  console.log('=== Super Admin credentials ===');
  console.log('username: david@goxxii.com');
  console.log(`password: ${davidPassword}`);
  console.log('role:     super_admin');
  console.log('Also ensured "admin" is super_admin (password unchanged).');
  console.log('Removed shahmeerahmed219@gmail.com if it existed.');
} finally {
  await conn.end();
}
