import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
import mysql from "mysql2/promise";

const pool = mysql.createPool(process.env.DATABASE_URL);
const [users] = await pool.query(
  `SELECT id, first_name, last_name, email, status
     FROM tms_users
    WHERE LOWER(CONCAT(COALESCE(first_name,''), ' ', COALESCE(last_name,''))) LIKE '%nik%'
       OR LOWER(COALESCE(email,'')) LIKE '%nik%'
       OR LOWER(COALESCE(first_name,'')) IN ('nick','nikola')
       OR LOWER(COALESCE(last_name,'')) LIKE '%sukil%'`
);
console.log("USERS");
for (const u of users) {
  console.log(
    JSON.stringify({
      id: u.id,
      name: `${u.first_name || ""} ${u.last_name || ""}`.trim(),
      email: u.email,
      status: u.status,
    })
  );
}
const [dets] = await pool.query(
  `SELECT dispatcher, dispatcher_email, COUNT(*) n
     FROM detentions
    WHERE LOWER(dispatcher) LIKE '%nik%'
       OR LOWER(dispatcher) LIKE '%sukil%'
       OR LOWER(TRIM(dispatcher)) IN ('nick','nikola')
    GROUP BY dispatcher, dispatcher_email
    ORDER BY n DESC`
);
console.log("DETENTIONS");
for (const r of dets) {
  console.log(JSON.stringify({ dispatcher: r.dispatcher, email: r.dispatcher_email, n: Number(r.n) }));
}
await pool.end();
