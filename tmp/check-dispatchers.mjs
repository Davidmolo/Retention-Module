import nextEnv from "@next/env";
import mysql from "mysql2/promise";

nextEnv.loadEnvConfig(process.cwd());
if (!process.env.DATABASE_URL) {
  console.error("NO_DATABASE_URL");
  process.exit(1);
}

const c = await mysql.createConnection(process.env.DATABASE_URL);
const [users] = await c.query(
  `SELECT id, first_name, last_name, status, user_type
     FROM tms_users
    WHERE LOWER(last_name) IN ('simkus', 'norris', 'sieg', 'rosick')
       OR LOWER(first_name) IN ('tom', 'lindsay', 'ronnie')`
);
console.log("USERS");
for (const u of users) {
  console.log(
    [u.id, u.first_name, u.last_name, u.status, u.user_type].join(" | ")
  );
}

const [drivers] = await c.query(
  `SELECT d.id, d.first_name, d.last_name, d.status, d.date_removed,
          d.manager_id, d.substitute_manager_id,
          TRIM(CONCAT_WS(' ', m.first_name, m.last_name)) AS manager,
          m.status AS manager_status
     FROM drivers d
     LEFT JOIN tms_users m ON m.id = d.manager_id
    WHERE LOWER(d.last_name) IN ('simkus', 'norris', 'sieg', 'rosick')
       OR LOWER(TRIM(CONCAT_WS(' ', m.first_name, m.last_name))) LIKE '%simkus%'`
);
console.log("DRIVERS");
for (const d of drivers) {
  console.log(
    [
      d.id,
      d.first_name,
      d.last_name,
      d.status,
      d.date_removed ? String(d.date_removed).slice(0, 10) : "",
      "mgr",
      d.manager_id,
      d.manager,
      d.manager_status,
      "sub",
      d.substitute_manager_id,
    ].join(" | ")
  );
}
await c.end();
