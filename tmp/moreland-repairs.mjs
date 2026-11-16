import nextEnv from '@next/env';
import mysql from 'mysql2/promise';

nextEnv.loadEnvConfig(process.cwd());
const p = await mysql.createPool(process.env.DATABASE_URL);
const id = 37820;

const [acc] = await p.query(
  `SELECT * FROM driver_accessorials
    WHERE driver_id = ?
    ORDER BY COALESCE(settlement_date, settlement_week_start, source_created_at) DESC
    LIMIT 40`,
  [id]
);
console.log('ALL recent accessorials for Moreland:', acc.length);
for (const a of acc) {
  console.log({
    id: a.id,
    load_id: a.load_id,
    amount: Number(a.amount),
    category: a.category,
    note: a.note,
    status: a.settlement_status,
    week: `${a.settlement_week_start}..${a.settlement_week_end}`,
    settDate: a.settlement_date,
    created: a.source_created_at,
  });
}

const [acc150] = await p.query(
  `SELECT * FROM driver_accessorials
    WHERE driver_id = ?
      AND (
        ABS(amount - 150) < 0.01
        OR LOWER(COALESCE(category,'')) LIKE '%repair%'
        OR LOWER(COALESCE(note,'')) LIKE '%repair%'
        OR LOWER(COALESCE(note,'')) LIKE '%truck%200%'
        OR LOWER(COALESCE(category,'')) LIKE '%reimburse%'
      )`,
  [id]
);
console.log('\nRepair/150 matches:', acc150);

const [any150] = await p.query(
  `SELECT da.*, TRIM(CONCAT_WS(' ', d.first_name, d.last_name)) name
     FROM driver_accessorials da
     LEFT JOIN drivers d ON d.id = da.driver_id
    WHERE ABS(da.amount - 150) < 0.01
      AND (
        da.settlement_week_start BETWEEN '2026-10-06' AND '2026-10-20'
        OR da.settlement_date BETWEEN '2026-10-06' AND '2026-10-31'
        OR da.source_created_at BETWEEN '2026-10-06' AND '2026-10-31'
      )
    ORDER BY da.id DESC
    LIMIT 30`
);
console.log('\nAny $150 accessorials around Oct:', any150.length);
for (const a of any150) {
  console.log({
    id: a.id,
    name: a.name,
    driver: a.driver_id,
    amount: Number(a.amount),
    category: a.category,
    note: a.note,
    week: `${a.settlement_week_start}..${a.settlement_week_end}`,
  });
}

const [rep] = await p.query(
  `SELECT mileage, drivers_pay, gross_income FROM gross_profit_reports
    WHERE year=2026 AND week=43 AND driver_id=?`,
  [id]
);
console.log('\nGP W43', rep[0]);
console.log(
  'If +150 repairs added to pay:',
  Number(rep[0]?.drivers_pay) + 150
);

await p.end();
