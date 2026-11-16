import fs from 'fs';
import nextEnv from '@next/env';
import XLSX from 'xlsx';
import mysql from 'mysql2/promise';

nextEnv.loadEnvConfig(process.cwd());
const p = await mysql.createPool(process.env.DATABASE_URL);

const [drv] = await p.query(
  `SELECT id, first_name, last_name, compensation_id, driver_type
     FROM drivers WHERE last_name LIKE '%Kincaid%' AND first_name LIKE '%Jerome%'`
);
console.log('DRIVER', drv);
const id = drv[0]?.id;

for (const week of [42, 43]) {
  const [rep] = await p.query(
    `SELECT unit, mileage, trips, gross_income, drivers_pay, compensation_name,
            fuel, fuel_mpg, fuel_ppg, prepass, gross_profit
       FROM gross_profit_reports
      WHERE year=2026 AND week=? AND driver_id=?`,
    [week, id]
  );
  console.log(`\nGP W${week}`, rep[0] || null);
}

const [comp] = await p.query(`SELECT * FROM compensations WHERE id=?`, [
  drv[0]?.compensation_id,
]);
console.log('\nCOMP', comp[0]);

const start = '2026-10-06';
const end = '2026-10-12';

const [parts] = await p.query(
  `
  SELECT 'solo' AS part, l.id AS load_id, l.gp_load, l.status, l.driver_count,
         COALESCE(l.miles,0) AS loaded, COALESCE(l.empty_miles,0) AS empty_mi,
         COALESCE(lf.linehaul_rate, l.linehaul_rate, l.revenue, 0) AS linehaul,
         DATE(l.delivery_at) AS week_date
    FROM loads l
    LEFT JOIN load_financials lf ON lf.load_id = l.id
   WHERE l.driver_id = ?
     AND DATE(l.delivery_at) BETWEEN ? AND ?
     AND COALESCE(l.driver_count, 0) < 2
     AND LOWER(TRIM(COALESCE(l.status,''))) <> 'canceled'
  UNION ALL
  SELECT 'helper', l.id, l.gp_load, l.status, l.driver_count,
         COALESCE(dr.loaded_miles,0), COALESCE(dr.empty_miles,0),
         CASE WHEN COALESCE(dr.revenue,0)<>0 THEN dr.revenue
              WHEN COALESCE(l.miles,0)>0 THEN
                COALESCE(lf.linehaul_rate,l.linehaul_rate,l.revenue,0)
                * COALESCE(dr.loaded_miles,0)/l.miles
              ELSE 0 END,
         DATE(COALESCE(dr.source_created_at, dr.source_updated_at))
    FROM driver_routes dr
    JOIN loads l ON l.id = dr.load_id
    LEFT JOIN load_financials lf ON lf.load_id = l.id
   WHERE dr.driver_id = ?
     AND l.driver_id IS NOT NULL AND l.driver_id <> dr.driver_id
     AND DATE(COALESCE(dr.source_created_at, dr.source_updated_at)) BETWEEN ? AND ?
     AND COALESCE(l.driver_count,0) >= 2
  UNION ALL
  SELECT 'owner', l.id, l.gp_load, l.status, l.driver_count,
         COALESCE(dr.loaded_miles,0), COALESCE(dr.empty_miles,0),
         CASE WHEN COALESCE(dr.revenue,0)<>0 THEN dr.revenue
              WHEN COALESCE(l.miles,0)>0 THEN
                COALESCE(lf.linehaul_rate,l.linehaul_rate,l.revenue,0)
                * COALESCE(dr.loaded_miles,0)/l.miles
              ELSE 0 END,
         DATE(l.delivery_at)
    FROM driver_routes dr
    JOIN loads l ON l.id = dr.load_id
    LEFT JOIN load_financials lf ON lf.load_id = l.id
   WHERE dr.driver_id = ?
     AND l.driver_id = dr.driver_id
     AND DATE(l.delivery_at) BETWEEN ? AND ?
     AND COALESCE(l.driver_count,0) >= 2
  `,
  [id, start, end, id, start, end, id, start, end]
);

console.log('\n=== GP CREDITED PARTS W42 ===');
let miles = 0,
  loaded = 0,
  gross = 0;
for (const r of parts) {
  const lm = Number(r.loaded);
  const em = Number(r.empty_mi);
  const rev = Number(r.linehaul);
  miles += lm + em;
  loaded += lm;
  gross += rev;
  console.log({
    part: r.part,
    gp: r.gp_load,
    count: Number(r.driver_count),
    loaded: lm,
    empty: em,
    total: lm + em,
    revenue: rev,
    week: String(r.week_date),
  });
}
console.log('parts sum', { miles, loaded, empty: miles - loaded, gross });

const [acc] = await p.query(
  `SELECT id, load_id, amount, category, note,
          settlement_week_start, settlement_week_end
     FROM driver_accessorials
    WHERE driver_id=?
      AND settlement_week_start=?
      AND settlement_week_end=?`,
  [id, start, end]
);
console.log('\nW42 accessorials', acc);

const [accAll] = await p.query(
  `SELECT id, amount, category, note, settlement_week_start, settlement_week_end
     FROM driver_accessorials
    WHERE driver_id=?
    ORDER BY id DESC LIMIT 15`,
  [id]
);
console.log('\nRecent accessorials:');
for (const a of accAll) {
  console.log({
    id: a.id,
    amount: Number(a.amount),
    cat: a.category,
    note: a.note,
    week: `${a.settlement_week_start}..${a.settlement_week_end}`,
  });
}

// Sheet W42 if present
function parseMorelandLike(file, nameRe) {
  if (!fs.existsSync(file)) return null;
  const wb = XLSX.read(fs.readFileSync(file), { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
    header: 1,
    raw: true,
    defval: null,
  });
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c++) {
      const v = row[c];
      if (typeof v === 'string' && nameRe.test(v)) {
        const block = { name: v.trim(), unit: row[c + 1] };
        for (let k = 1; k <= 22; k++) {
          const lab = String(rows[r + k]?.[c] || '').trim();
          if (!lab) continue;
          block[lab] = {
            a: rows[r + k]?.[c + 1],
            b: rows[r + k]?.[c + 2],
            calc: rows[r + k]?.[c + 3],
          };
        }
        return block;
      }
    }
  }
  return null;
}

const sheet42 = parseMorelandLike('tmp/W42.xlsx', /kincaid/i);
console.log('\nSHEET W42', sheet42 && {
  name: sheet42.name,
  unit: sheet42.unit,
  mileage: sheet42.MILEAGE?.a,
  gross: sheet42['TOTAL GROSS INCOME']?.a,
  pay: sheet42["Driver's pay"]?.a,
  prepass: sheet42.PREPASS?.a,
});

const orMiles = 2925.8;
const orEarn = 2165.93;
const [rep42] = await p.query(
  `SELECT mileage, drivers_pay, gross_income FROM gross_profit_reports
    WHERE year=2026 AND week=42 AND driver_id=?`,
  [id]
);
const db = rep42[0];
console.log('\nCOMPARE OpenRoad vs GP W42', {
  or_miles: orMiles,
  gp_miles: Number(db?.mileage),
  mile_delta: Number(db?.mileage) - orMiles,
  or_total_earnings: orEarn,
  gp_drivers_pay: Number(db?.drivers_pay),
  pay_delta: Number(db?.drivers_pay) - orEarn,
  gp_gross: Number(db?.gross_income),
});

if (comp[0]?.status === 'Per Mile') {
  const rate = Number(comp[0].loaded_mile_rate);
  console.log('GP miles x rate', Number((Number(db?.mileage) * rate).toFixed(2)));
  console.log('OR miles x rate', Number((orMiles * rate).toFixed(2)));
}

await p.end();
