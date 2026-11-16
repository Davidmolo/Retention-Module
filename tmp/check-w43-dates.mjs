import nextEnv from "@next/env";
import mysql from "mysql2/promise";

nextEnv.loadEnvConfig(process.cwd());
const conn = await mysql.createConnection(process.env.DATABASE_URL);

const ids = [6823, 23274, 39423, 38312, 38728];
const [loads] = await conn.query(
  `SELECT driver_id, id, status,
          DATE_FORMAT(delivery_at, '%Y-%m-%d %H:%i:%s') del,
          DATE_FORMAT(pickup_at, '%Y-%m-%d %H:%i:%s') pu,
          linehaul_rate, revenue, miles, driver_count
     FROM loads
    WHERE driver_id IN (?)
      AND delivery_at >= '2026-10-01'
      AND delivery_at < '2026-10-26'
    ORDER BY driver_id, delivery_at`,
  [ids]
);
for (const l of loads) {
  const inW43 = l.del >= "2026-10-13 00:00:00" && l.del < "2026-10-20 00:00:00";
  console.log(
    l.driver_id,
    l.id,
    l.status,
    "del",
    l.del,
    inW43 ? "IN_W43" : "OUT",
    "lh",
    l.linehaul_rate,
    "rev",
    l.revenue,
    "mi",
    l.miles,
    "dc",
    l.driver_count
  );
}

const [acc] = await conn.query(
  `SELECT driver_id, settlement_week_start, settlement_week_end, category, amount
     FROM driver_accessorials
    WHERE driver_id IN (?)
      AND settlement_week_start >= '2026-10-06'
      AND settlement_week_start <= '2026-10-20'
    ORDER BY driver_id, settlement_week_start`,
  [ids]
);
console.log("ACCESSORIALS", acc.length);
for (const a of acc) {
  console.log(a.driver_id, a.settlement_week_start, a.settlement_week_end, a.category, a.amount);
}
await conn.end();
