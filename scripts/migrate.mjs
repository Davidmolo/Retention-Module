// Runs every .sql file in data/migrations in filename order.
// Usage: pnpm db:migrate  (loads DATABASE_URL from .env.local / .env)
import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Fill it in .env.local first.');
  process.exit(1);
}

const dir = path.join(process.cwd(), 'data', 'migrations');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

const conn = await mysql.createConnection(url);
try {
  // Track applied migrations so each file runs exactly once (ALTERs aren't
  // idempotent). Files already applied via IF NOT EXISTS get recorded harmlessly.
  await conn.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       filename VARCHAR(255) PRIMARY KEY,
       applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
     )`
  );
  const [appliedRows] = await conn.query('SELECT filename FROM schema_migrations');
  const applied = new Set(appliedRows.map((r) => r.filename));

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`Skipping ${file} (already applied)`);
      continue;
    }
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    // Strip CR then comments before splitting on ';', otherwise a ';' inside a
    // trailing `-- comment` (common with CRLF files) falsely splits statements.
    const statements = sql
      .split('\n')
      .map((line) => line.replace(/\r$/, '').replace(/--.*$/, ''))
      .join('\n')
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);
    console.log(`Running ${file} (${statements.length} statement(s))...`);
    for (const stmt of statements) {
      await conn.query(stmt);
    }
    await conn.query('INSERT INTO schema_migrations (filename) VALUES (?)', [file]);
  }
  console.log('Migrations complete.');
} finally {
  await conn.end();
}
