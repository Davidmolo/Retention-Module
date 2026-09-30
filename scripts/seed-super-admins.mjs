/**
 * Seed Super Admin accounts (David + developer temporary).
 *
 *   pnpm exec node scripts/seed-super-admins.mjs
 *
 * Optional overrides:
 *   SEED_SUPER_DAVID_PASSWORD=...
 *   SEED_SUPER_DEV_PASSWORD=...
 *   SEED_SUPER_DEV_USERNAME=shahmeerahmed219@gmail.com
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
  // Readable but strong: base64url without padding
  return crypto.randomBytes(bytes).toString('base64url').slice(0, 16);
}

const ALL_MODULES_JSON = JSON.stringify([
  'dashboard',
  'gross-profit',
  'retention',
  'detention',
]);

const accounts = [
  {
    username: 'david@goxxii.com',
    displayName: 'David',
    password:
      process.env.SEED_SUPER_DAVID_PASSWORD?.trim() || genPassword(),
  },
  {
    username:
      process.env.SEED_SUPER_DEV_USERNAME?.trim() ||
      'shahmeerahmed219@gmail.com',
    displayName: 'Dev Super Admin',
    password: process.env.SEED_SUPER_DEV_PASSWORD?.trim() || genPassword(),
  },
];

const conn = await mysql.createConnection(url);
try {
  // Ensure columns exist (migration 038); ignore if already present.
  try {
    await conn.query(
      `ALTER TABLE users
         ADD COLUMN display_name VARCHAR(255) NULL AFTER role,
         ADD COLUMN modules_json TEXT NULL AFTER display_name`
    );
  } catch (e) {
    const msg = String(e?.message || e);
    if (!/Duplicate column/i.test(msg)) {
      // role column might be missing display_name position — try softer
      if (!/check that column\/key exists|Unknown column 'role'/i.test(msg)) {
        console.warn('[seed-super-admins] alter skipped:', msg);
      }
    }
  }

  console.log('=== Super Admin credentials (save these) ===');
  for (const acct of accounts) {
    const hash = await bcrypt.hash(acct.password, 10);
    await conn.query(
      `INSERT INTO users (username, password_hash, role, display_name, modules_json)
       VALUES (?, ?, 'super_admin', ?, ?)
       ON DUPLICATE KEY UPDATE
         password_hash = VALUES(password_hash),
         role = 'super_admin',
         display_name = VALUES(display_name),
         modules_json = VALUES(modules_json)`,
      [acct.username, hash, acct.displayName, ALL_MODULES_JSON]
    );
    console.log(`username: ${acct.username}`);
    console.log(`password: ${acct.password}`);
    console.log(`role:     super_admin`);
    console.log('---');
  }

  // Promote legacy shared admin login to Super Admin without changing its password.
  await conn.query(
    `UPDATE users
     SET role = 'super_admin',
         modules_json = ?,
         display_name = COALESCE(NULLIF(display_name, ''), 'Admin')
     WHERE username = 'admin'`,
    [ALL_MODULES_JSON]
  );
  console.log('Also promoted existing "admin" user to super_admin (password unchanged).');
} finally {
  await conn.end();
}
