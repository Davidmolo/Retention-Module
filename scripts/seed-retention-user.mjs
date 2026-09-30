/**
 * Create / update a staff login with Retention-only modules by default.
 *
 *   SEED_RETENTION_USERNAME=james SEED_RETENTION_PASSWORD='...' pnpm retention:seed-user
 *
 * Role = staff → modules decided via modules_json (default: Retention only).
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
const modulesJson = JSON.stringify(['dashboard', 'retention']);

if (!password || password === 'changeme') {
  console.warn(
    'Using default/placeholder password — set SEED_RETENTION_PASSWORD for production.'
  );
}

const hash = await bcrypt.hash(password, 10);
const conn = await mysql.createConnection(url);
try {
  await conn.query(
    `INSERT INTO users (username, password_hash, role, modules_json)
     VALUES (?, ?, 'staff', ?)
     ON DUPLICATE KEY UPDATE
       password_hash = VALUES(password_hash),
       role = 'staff',
       modules_json = VALUES(modules_json)`,
    [username, hash, modulesJson]
  );
  console.log(`Seeded staff user "${username}" (role=staff).`);
} finally {
  await conn.end();
}
