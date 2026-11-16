import nextEnv from "@next/env";
import mysql from "mysql2/promise";

nextEnv.loadEnvConfig(process.cwd());
const conn = await mysql.createConnection(process.env.DATABASE_URL);

const names = ["Rodney Coleman", "Frank Carr", "FRANK CARR", "Deandre Meighan", "Mcginnis", "McGinnis", "Houston", "Liudas"];
const [drivers] = await conn.query(
  `SELECT id, first_name, last_name, status, driver_type
     FROM drivers
    WHERE CONCAT(first_name, ' ', last_name) LIKE '%Coleman%'
       OR CONCAT(first_name, ' ', last_name) LIKE '%Carr%'
       OR CONCAT(first_name, ' ', last_name) LIKE '%Meighan%'
       OR last_name LIKE '%cginnis%'
       OR last_name LIKE '%ouston%'
       OR last_name LIKE '%urevicius%'`
);
console.log("DRIVERS");
for (const d of drivers) console.log(d.id, d.status, d.driver_type, d.first_name, d.last_name);

const ids = drivers.map((d) => d.id);
if (ids.length) {
  const [loads] = await conn.query(
    `SELECT id, driver_id, status, linehaul_rate, revenue, miles, empty_miles,
            pickup_at, delivery_at, driver_count
       FROM loads
      WHERE driver_id IN (?)
        AND delivery_at >= '2026-10-10'
        AND delivery_at < '2026-10-22'
      ORDER BY driver_id, delivery_at`,
    [ids]
  );
  console.log("LOADS", loads.length);
  for (const l of loads) {
    console.log(
      l.driver_id,
      "load",
      l.id,
      l.status,
      "lh",
      l.linehaul_rate,
      "rev",
      l.revenue,
      "mi",
      l.miles,
      "pu",
      l.pickup_at,
      "del",
      l.delivery_at,
      "dc",
      l.driver_count
    );
  }
}

const [cred] = await conn.query("SELECT 1");
console.log("DB_OK", cred.length);
await conn.end();
