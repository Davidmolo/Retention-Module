import nextEnv from "@next/env";
import mysql from "mysql2/promise";

nextEnv.loadEnvConfig(process.cwd());
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("NO_DATABASE_URL");
  process.exit(2);
}

const conn = await mysql.createConnection({
  uri: url,
  connectTimeout: 8000,
});

const [invites] = await conn.query(
  `SELECT email, status, accepted_at, created_at
     FROM user_invites
    WHERE email LIKE '%james%' OR email LIKE '%nadia%'
    ORDER BY created_at DESC`
);
const [users] = await conn.query(
  `SELECT username, role, created_at
     FROM users
    WHERE username LIKE '%james%' OR username LIKE '%nadia%'
    ORDER BY username`
);
console.log(JSON.stringify({ invites, users }, null, 2));
await conn.end();
