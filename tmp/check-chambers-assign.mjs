import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());
const { getPool } = await import('../lib/db.ts');
const pool = getPool();
const [rows] = await pool.query(
  `SELECT id, first_name, last_name FROM drivers
    WHERE last_name LIKE '%Chambers%' OR id = 24215`
);
console.log('drivers', rows);
const [a] = await pool.query(
  `SELECT a.driver_id, tr.unit, a.start_date, a.end_date
     FROM assignments a
     JOIN trucks tr ON tr.id = a.truck_id
    WHERE a.driver_id = 24215
      AND DATE(a.start_date) <= '2026-10-19'
      AND (a.end_date IS NULL OR DATE(a.end_date) >= '2026-10-13')`
);
console.log('assignments', a);
const [g] = await pool.query(
  `SELECT fuel_ppg, fuel_mpg, fuel, mileage, gross_income
     FROM gross_profit_reports
    WHERE year = 2026 AND week = 43 AND driver_id = 24215`
);
console.log('current GP', g);
await pool.end();
