import nextEnv from "@next/env";
import mysql from "mysql2/promise";

nextEnv.loadEnvConfig(process.cwd());
const conn = await mysql.createConnection(process.env.DATABASE_URL);

const [filled] = await conn.query(
  `SELECT COUNT(*) n,
          SUM(linehaul_rate IS NOT NULL) has_lh,
          SUM(revenue IS NOT NULL) has_rev
     FROM loads
    WHERE delivery_at >= '2026-10-01' AND delivery_at < '2026-11-01'`
);
console.log("OCT_LOADS", filled[0]);

const loadIds = [2361092, 2358332, 2354824, 2357640, 2353935, 2356855, 2354402];
const [routes] = await conn.query(
  `SELECT load_id, driver_id, loaded_miles, empty_miles, revenue,
          DATE_FORMAT(source_created_at, '%Y-%m-%d %H:%i') created
     FROM driver_routes
    WHERE load_id IN (?)`,
  [loadIds]
);
console.log("ROUTES", routes.length);
for (const r of routes) {
  console.log(r.load_id, "drv", r.driver_id, "lm", r.loaded_miles, "em", r.empty_miles, "rev", r.revenue, r.created);
}

const [rep] = await conn.query(
  `SELECT driver_id, driver_name, week, mileage, gross_income, drivers_pay
     FROM gross_profit_reports
    WHERE year=2026 AND week=43 AND driver_id IN (6823, 23274, 39423)`
);
console.log("REPORT");
for (const r of rep) console.log(r.week, r.driver_id, r.driver_name, r.mileage, r.gross_income, r.drivers_pay);

await conn.end();
