import nextEnv from "@next/env";
import mysql from "mysql2/promise";

nextEnv.loadEnvConfig(process.cwd());
const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.query(
  `SELECT week, driver_id, driver_name, driver_status, mileage, gross_income, drivers_pay
     FROM gross_profit_reports
    WHERE year = 2026 AND week IN (42, 43)
      AND driver_id IN (23274, 6823, 39423, 40518, 38312, 38728)
    ORDER BY driver_id, week`
);
for (const r of rows) {
  console.log(r.week, r.driver_id, r.driver_name, r.driver_status, r.mileage, r.gross_income, r.drivers_pay);
}
const [gone] = await conn.query(
  `SELECT id, status FROM drivers WHERE id IN (38312, 38728)`
);
console.log("STATUS", JSON.stringify(gone));
await conn.end();
