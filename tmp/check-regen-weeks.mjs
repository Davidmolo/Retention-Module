import nextEnv from '@next/env';
import mysql from 'mysql2/promise';

nextEnv.loadEnvConfig(process.cwd());
const p = await mysql.createPool(process.env.DATABASE_URL);

const [cols] = await p.query(`SHOW COLUMNS FROM gross_profit_reports`);
const names = cols.map((c) => c.Field);
console.log(
  'time-ish cols',
  names.filter((n) => /at|time|generat|creat|updat/i.test(n))
);

const [weeks] = await p.query(
  `SELECT week, COUNT(*) AS n
     FROM gross_profit_reports
    WHERE year = 2026 AND week BETWEEN 38 AND 45
    GROUP BY week
    ORDER BY week`
);
console.log('weeks', weeks);

// Spot-check: any W43 driver still with multi-route inflation pattern?
// Compare a few known-fixed names
const [fixed] = await p.query(
  `SELECT week, driver_name, mileage, drivers_pay
     FROM gross_profit_reports
    WHERE year=2026 AND (
      (week=43 AND driver_id IN (39465,39073,39423,37820))
      OR (week=42 AND driver_id=38802)
    )
    ORDER BY week, driver_name`
);
console.log('case drivers', fixed);

await p.end();
