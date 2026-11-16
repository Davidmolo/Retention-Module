import nextEnv from '@next/env';
import mysql from 'mysql2/promise';

nextEnv.loadEnvConfig(process.cwd());
const p = await mysql.createPool(process.env.DATABASE_URL);

const [sum] = await p.query(
  `SELECT COUNT(*) n,
          SUM(CASE WHEN COALESCE(mileage,0)=0 AND COALESCE(gross_income,0)=0 THEN 1 ELSE 0 END) zero_rows,
          SUM(CASE WHEN LOWER(COALESCE(driver_status,''))<>'active' THEN 1 ELSE 0 END) non_active
     FROM gross_profit_reports WHERE year=2026 AND week=44`
);
console.log('W44 summary', sum[0]);

const [non] = await p.query(
  `SELECT driver_name, driver_status, mileage, gross_income, trips
     FROM gross_profit_reports
    WHERE year=2026 AND week=44 AND LOWER(COALESCE(driver_status,''))<>'active'
    ORDER BY driver_name`
);
console.log('W44 non-active', non);

await p.end();
