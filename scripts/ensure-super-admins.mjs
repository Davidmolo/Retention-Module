import mysql from 'mysql2/promise';
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const mods = JSON.stringify([
  'dashboard',
  'gross-profit',
  'retention',
  'detention',
]);

const conn = await mysql.createConnection(url);
try {
  await conn.query(
    `UPDATE users
     SET role = 'super_admin',
         modules_json = ?,
         display_name = COALESCE(NULLIF(display_name, ''), 'David')
     WHERE username = 'david@goxxii.com'`,
    [mods]
  );
  await conn.query(
    `UPDATE users
     SET role = 'super_admin',
         modules_json = ?,
         display_name = COALESCE(NULLIF(display_name, ''), 'Admin')
     WHERE username IN ('admin', 'shahmeerahmed219@gmail.com')`,
    [mods]
  );
  const [rows] = await conn.query(
    `SELECT username, role, display_name
     FROM users
     WHERE role = 'super_admin'
        OR username IN ('admin', 'david@goxxii.com', 'shahmeerahmed219@gmail.com')
     ORDER BY username`
  );
  console.log(rows);
} finally {
  await conn.end();
}
