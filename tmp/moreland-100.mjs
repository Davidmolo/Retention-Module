import nextEnv from '@next/env';
import mysql from 'mysql2/promise';

nextEnv.loadEnvConfig(process.cwd());
const p = await mysql.createPool(process.env.DATABASE_URL);
const id = 37820;

const [rep] = await p.query(
  `SELECT mileage, drivers_pay, gross_income, trips, unit
     FROM gross_profit_reports
    WHERE year=2026 AND week=43 AND driver_id=?`,
  [id]
);
console.log('GP W43', rep[0]);

// any $100 accessorials for Moreland ever / around Oct
const [acc100] = await p.query(
  `SELECT id, load_id, amount, category, note,
          settlement_status, settlement_week_start, settlement_week_end,
          settlement_date, source_created_at
     FROM driver_accessorials
    WHERE driver_id = ?
      AND ABS(amount - 100) < 0.01
    ORDER BY id DESC`,
  [id]
);
console.log('\nMoreland $100 accessorials:');
for (const a of acc100) {
  console.log({
    id: a.id,
    load: a.load_id,
    amount: Number(a.amount),
    category: a.category,
    note: a.note,
    week: `${a.settlement_week_start}..${a.settlement_week_end}`,
    settDate: a.settlement_date,
    created: a.source_created_at,
  });
}

const [accW43] = await p.query(
  `SELECT id, load_id, amount, category, note,
          settlement_week_start, settlement_week_end
     FROM driver_accessorials
    WHERE driver_id = ?
      AND settlement_week_start = '2026-10-13'
      AND settlement_week_end = '2026-10-19'`,
  [id]
);
console.log('\nAll W43 settlement-week accessorials:', accW43);

// sheet vs gp from compare
console.log('\nFrom earlier compare W43 Moreland pay: sheet 1759.61 vs db 1659.59 delta -100.02');
console.log(
  'GP pay + 100 =',
  Number(rep[0]?.drivers_pay) + 100,
  '(matches sheet 1759.61?)',
  Math.abs(Number(rep[0]?.drivers_pay) + 100 - 1759.61) < 0.02
);

// search accessorials with repair / truck 200 / 10/15 text any driver unit 200
const [txt] = await p.query(
  `SELECT da.id, da.driver_id, da.amount, da.category, da.note,
          da.settlement_week_start, da.settlement_week_end,
          TRIM(CONCAT_WS(' ', d.first_name, d.last_name)) name
     FROM driver_accessorials da
     LEFT JOIN drivers d ON d.id = da.driver_id
    WHERE da.driver_id = ?
       OR (
         LOWER(CONCAT(COALESCE(da.note,''),' ',COALESCE(da.category,'')))
         LIKE '%truck 200%'
         OR LOWER(COALESCE(da.note,'')) LIKE '%repair%'
       )
    ORDER BY da.id DESC
    LIMIT 30`,
  [id]
);
console.log('\nMoreland all + repair/truck200 hits:');
for (const a of txt.slice(0, 15)) {
  console.log({
    id: a.id,
    name: a.name,
    amount: Number(a.amount),
    cat: a.category,
    note: a.note,
    week: `${a.settlement_week_start}..${a.settlement_week_end}`,
  });
}

await p.end();
