import nextEnv from '@next/env';
import mysql from 'mysql2/promise';

nextEnv.loadEnvConfig(process.cwd());
const p = await mysql.createPool(process.env.DATABASE_URL);

const [load] = await p.query(
  `SELECT l.id, l.gp_load, l.status, l.driver_id, l.miles, l.empty_miles,
          l.pickup_at, l.delivery_at,
          lf.linehaul_rate, lf.total, lf.misc_sum, lf.deductions_sum
     FROM loads l
     LEFT JOIN load_financials lf ON lf.load_id = l.id
    WHERE l.id = 2364918`
);
console.log('Load tied to $150 accessorial', load[0]);

const [w43] = await p.query(
  `SELECT mileage, drivers_pay, gross_income FROM gross_profit_reports
    WHERE year=2026 AND week=43 AND driver_id=37820`
);
const [w44] = await p.query(
  `SELECT mileage, drivers_pay, gross_income FROM gross_profit_reports
    WHERE year=2026 AND week=44 AND driver_id=37820`
);
console.log('GP W43', w43[0]);
console.log('GP W44', w44[0]);

// What accessorials W43 vs W44 week filter would pick up
const [a43] = await p.query(
  `SELECT id, amount, category, note, settlement_week_start, settlement_week_end
     FROM driver_accessorials
    WHERE driver_id=37820
      AND settlement_week_start='2026-10-13'
      AND settlement_week_end='2026-10-19'`
);
const [a44] = await p.query(
  `SELECT id, amount, category, note, settlement_week_start, settlement_week_end
     FROM driver_accessorials
    WHERE driver_id=37820
      AND settlement_week_start='2026-10-20'
      AND settlement_week_end='2026-10-26'`
);
console.log('Acc credited in W43 filter', a43);
console.log('Acc credited in W44 filter', a44);

// Search notes/categories globally for repair-like text near Moreland unit
const [repLike] = await p.query(
  `SELECT da.id, da.driver_id, da.amount, da.category, da.note,
          da.settlement_week_start, da.settlement_week_end,
          TRIM(CONCAT_WS(' ', d.first_name, d.last_name)) name
     FROM driver_accessorials da
     LEFT JOIN drivers d ON d.id = da.driver_id
    WHERE LOWER(CONCAT(COALESCE(da.category,''),' ',COALESCE(da.note,'')))
          REGEXP 'repair|truck 200|truck200|reimburse'
    ORDER BY da.id DESC
    LIMIT 20`
);
console.log('\nAccessorials with repair/truck 200 text:', repLike);

await p.end();
