import nextEnv from '@next/env';
import mysql from 'mysql2/promise';

nextEnv.loadEnvConfig(process.cwd());

const { storeWeeklySummary } = await import('../lib/sources/weeklySummary.ts');

console.log('Regenerating W42 (store only)…');
console.log(await storeWeeklySummary(2026, 42));

console.log('Regenerating W43 (store only)…');
console.log(await storeWeeklySummary(2026, 43));

const p = await mysql.createPool(process.env.DATABASE_URL);
const checks = [
  { week: 43, id: 39465, name: 'Lyndon Smith', expectMi: 2703.3, tol: 5 },
  { week: 43, id: 39073, name: 'Morgan Mcgrew', expectMi: 1871.1, tol: 10 },
  { week: 43, id: 39423, name: 'Deandre Meighan', expectMi: 2046.9, tol: 5 },
  { week: 43, id: 37820, name: 'Robert Moreland', expectPay: 1659.59, tol: 0.05 },
  { week: 42, id: 38802, name: 'Jerome Kincaid', expectPay: 2120.51, tol: 0.05 },
];

console.log('\n=== VERIFY ===');
for (const c of checks) {
  const [rows] = await p.query(
    `SELECT mileage, drivers_pay, gross_income, trips
       FROM gross_profit_reports
      WHERE year=2026 AND week=? AND driver_id=?`,
    [c.week, c.id]
  );
  const r = rows[0];
  const mi = Number(r?.mileage);
  const pay = Number(r?.drivers_pay);
  const out = {
    name: c.name,
    week: c.week,
    mileage: mi,
    pay,
    gross: Number(r?.gross_income),
    trips: Number(r?.trips),
  };
  if (c.expectMi != null) {
    out.expectMi = c.expectMi;
    out.miDelta = Number((mi - c.expectMi).toFixed(2));
    out.miOk = Math.abs(mi - c.expectMi) <= c.tol;
  }
  if (c.expectPay != null) {
    out.expectPay = c.expectPay;
    out.payDelta = Number((pay - c.expectPay).toFixed(2));
    out.payOk = Math.abs(pay - c.expectPay) <= c.tol;
  }
  console.log(out);
}

await p.end();
