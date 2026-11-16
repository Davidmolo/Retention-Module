import nextEnv from "@next/env";
import mysql from "mysql2/promise";
nextEnv.loadEnvConfig(process.cwd());
const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [d] = await conn.query(
  `SELECT id, status, driver_type,
          DATE_FORMAT(date_added,'%Y-%m-%d') added,
          DATE_FORMAT(date_removed,'%Y-%m-%d') removed,
          DATE_FORMAT(source_updated_at,'%Y-%m-%d %H:%i') updated
     FROM drivers
    WHERE id IN (38312, 38728)`
);
console.log("drivers", JSON.stringify(d, null, 2));
const [loads] = await conn.query(
  `SELECT id, driver_id, status,
          DATE_FORMAT(delivery_at,'%Y-%m-%d %H:%i') del,
          DATE_FORMAT(pickup_at,'%Y-%m-%d %H:%i') pu,
          miles
     FROM loads
    WHERE driver_id = 38312
      AND DATE(delivery_at) BETWEEN '2026-10-06' AND '2026-10-19'
    ORDER BY delivery_at`
);
console.log("loads", JSON.stringify(loads, null, 2));
await conn.end();
