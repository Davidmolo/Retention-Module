// Seeds (or updates) an admin user with a bcrypt-hashed password.
// Usage: pnpm db:seed
// Override defaults with SEED_ADMIN_USERNAME / SEED_ADMIN_PASSWORD.
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Fill it in .env.local first.');
  process.exit(1);
}

const username = process.env.SEED_ADMIN_USERNAME || 'admin';
const password = process.env.SEED_ADMIN_PASSWORD || 'password123';

const hash = await bcrypt.hash(password, 10);

const conn = await mysql.createConnection(url);
try {
  await conn.query(
    `INSERT INTO users (username, password_hash)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
    [username, hash]
  );
  console.log(`Seeded admin user "${username}".`);
} finally {
  await conn.end();
}
