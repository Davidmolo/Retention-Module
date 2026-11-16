import nextEnv from '@next/env';
import mysql from 'mysql2/promise';
nextEnv.loadEnvConfig(process.cwd());
const p = await mysql.createPool(process.env.DATABASE_URL);
const [rows] = await p.query(
  `SELECT week, driver_name, mileage, drivers_pay, trips
     FROM gross_profit_reports
    WHERE year=2026 AND (
      (week=43 AND driver_id IN (39465,39073,39423,37820))
      OR (week=42 AND driver_id=38802)
    )
    ORDER BY week, driver_name`
);
console.log(rows);
await p.end();
