import nextEnv from "@next/env";
import mysql from "mysql2/promise";
nextEnv.loadEnvConfig(process.cwd());
const conn = await mysql.createConnection(process.env.DATABASE_URL);

const [cols] = await conn.query(`SHOW COLUMNS FROM loads`);
console.log("load cols", cols.map((c) => c.Field).join(", "));

const [hits] = await conn.query(
  `SELECT l.id, l.gp_load, l.driver_id, l.status,
          DATE_FORMAT(l.pickup_at,'%Y-%m-%d') pu,
          DATE_FORMAT(l.delivery_at,'%Y-%m-%d') del,
          l.miles, l.empty_miles, lf.linehaul_rate, lf.detention_sum, lf.total
     FROM loads l
     LEFT JOIN load_financials lf ON lf.load_id = l.id
    WHERE l.gp_load LIKE '%00669%'
       OR l.gp_load LIKE '%00747%'
       OR l.id IN (SELECT load_id FROM driver_accessorials WHERE driver_id = 37820)
    ORDER BY l.delivery_at`
);
console.log("\nMORELAND-ISH");
for (const r of hits) console.log(JSON.stringify(r));

const [acc] = await conn.query(
  `SELECT load_id, driver_id, category, amount,
          DATE_FORMAT(settlement_week_start,'%Y-%m-%d') ws,
          DATE_FORMAT(settlement_week_end,'%Y-%m-%d') we
     FROM driver_accessorials
    WHERE driver_id = 37820
    ORDER BY settlement_week_end, load_id`
);
console.log("\nMORELAND ACC");
for (const r of acc) console.log(JSON.stringify(r));

const [jeff] = await conn.query(
  `SELECT l.id, l.gp_load, DATE_FORMAT(l.delivery_at,'%Y-%m-%d') del,
          lf.linehaul_rate, lf.detention_sum, lf.fuel_surcharge, lf.total,
          a.category, a.amount
     FROM loads l
     LEFT JOIN load_financials lf ON lf.load_id = l.id
     LEFT JOIN driver_accessorials a ON a.load_id = l.id
    WHERE l.driver_id = 37886
      AND DATE(l.delivery_at) BETWEEN '2026-10-06' AND '2026-10-12'`
);
console.log("\nJEFFERY W42");
for (const r of jeff) console.log(JSON.stringify(r));

const [w] = await conn.query(
  `SELECT week, COUNT(*) n FROM gross_profit_reports WHERE year=2026 AND week IN (42,43,44) GROUP BY week`
);
console.log("\nreports", JSON.stringify(w));
await conn.end();
