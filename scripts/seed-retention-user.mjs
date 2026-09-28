/**
 * Create / update a Retention-only staff login.
 *
 *   SEED_RETENTION_USERNAME=james SEED_RETENTION_PASSWORD='...' pnpm retention:seed-user
 *
 * Role = retention → can open Retention only (not Dashboard / Gross Profit).
 */
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const username = process.env.SEED_RETENTION_USERNAME || 'james';
const password = process.env.SEED_RETENTION_PASSWORD || 'changeme';

if (!password || password === 'changeme') {
  console.warn(
    'Using default/placeholder password — set SEED_RETENTION_PASSWORD for production.'
  );
}

const hash = await bcrypt.hash(password, 10);
const conn = await mysql.createConnection(url);
try {
  await conn.query(
    `INSERT INTO users (username, password_hash, role)
     VALUES (?, ?, 'retention')
     ON DUPLICATE KEY UPDATE
       password_hash = VALUES(password_hash),
       role = 'retention'`,
    [username, hash]
  );
  console.log(`Seeded retention-only user "${username}" (role=retention).`);
} finally {
  await conn.end();
}
