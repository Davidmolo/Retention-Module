import nextEnv from '@next/env';
import mysql from 'mysql2/promise';

nextEnv.loadEnvConfig(process.cwd());
const p = await mysql.createPool(process.env.DATABASE_URL);

const [drv] = await p.query(
  `SELECT id, first_name, last_name, compensation_id, driver_type
     FROM drivers
    WHERE last_name LIKE '%Moreland%' AND first_name LIKE '%Robert%'`
);
console.log('DRIVER', drv);
const id = drv[0]?.id;
const start = '2026-10-13';
const end = '2026-10-19';
const shotEarnings = 1522.76;
const shotMileagePay = 1500;
const shotExtraMile = 22.76;

const [rep] = await p.query(
  `SELECT * FROM gross_profit_reports
    WHERE year=2026 AND week=43 AND driver_id=?`,
  [id]
);
const r = rep[0];
console.log('GP REPORT key fields', {
  unit: r?.unit,
  mileage: r?.mileage,
  trips: r?.trips,
  gross_income: r?.gross_income,
  drivers_pay: r?.drivers_pay,
  compensation_name: r?.compensation_name,
  linehaul_pct: r?.linehaul_pct,
});

const [comp] = await p.query(
  `SELECT c.* FROM compensations c
    JOIN drivers d ON d.compensation_id = c.id
   WHERE d.id = ?`,
  [id]
);
console.log('COMPENSATION', comp[0]);

// GP trip parts (same rules)
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
  SELECT 'helper' AS part, l.id, l.gp_load, l.status, l.driver_count,
         COALESCE(dr.loaded_miles,0), COALESCE(dr.empty_miles,0),
         CASE
           WHEN COALESCE(dr.revenue, 0) <> 0 THEN dr.revenue
           WHEN COALESCE(l.miles, 0) > 0 THEN
             COALESCE(lf.linehaul_rate, l.linehaul_rate, l.revenue, 0)
             * COALESCE(dr.loaded_miles, 0) / l.miles
           ELSE 0
         END,
         DATE(COALESCE(dr.source_created_at, dr.source_updated_at))
    FROM driver_routes dr
    JOIN loads l ON l.id = dr.load_id
    LEFT JOIN load_financials lf ON lf.load_id = l.id
   WHERE dr.driver_id = ?
     AND l.driver_id IS NOT NULL
     AND l.driver_id <> dr.driver_id
     AND DATE(COALESCE(dr.source_created_at, dr.source_updated_at)) BETWEEN ? AND ?
     AND COALESCE(l.driver_count, 0) >= 2
  UNION ALL
  SELECT 'owner' AS part, l.id, l.gp_load, l.status, l.driver_count,
         COALESCE(dr.loaded_miles,0), COALESCE(dr.empty_miles,0),
         CASE
           WHEN COALESCE(dr.revenue, 0) <> 0 THEN dr.revenue
           WHEN COALESCE(l.miles, 0) > 0 THEN
             COALESCE(lf.linehaul_rate, l.linehaul_rate, l.revenue, 0)
             * COALESCE(dr.loaded_miles, 0) / l.miles
           ELSE 0
         END,
         DATE(l.delivery_at)
    FROM driver_routes dr
    JOIN loads l ON l.id = dr.load_id
    LEFT JOIN load_financials lf ON lf.load_id = l.id
   WHERE dr.driver_id = ?
     AND l.driver_id = dr.driver_id
     AND DATE(l.delivery_at) BETWEEN ? AND ?
     AND COALESCE(l.driver_count, 0) >= 2
  `,
  [id, start, end, id, start, end, id, start, end]
);

console.log('\n=== GP CREDITED PARTS ===');
let miles = 0,
  loaded = 0,
  gross = 0;
for (const row of parts) {
  const lm = Number(row.loaded);
  const em = Number(row.empty_mi);
  const rev = Number(row.linehaul);
  miles += lm + em;
  loaded += lm;
  gross += rev;
  console.log({
    part: row.part,
    gp: row.gp_load,
    count: Number(row.driver_count),
    loaded: lm,
    empty: em,
    totalMi: lm + em,
    revenue: rev,
    week: String(row.week_date),
  });
}
console.log('parts sum miles/loaded/gross', miles, loaded, gross);

const [accCols] = await p.query(`SHOW COLUMNS FROM driver_accessorials`);
console.log(
  'accessorial cols',
  accCols.map((c) => c.Field).join(', ')
);
const [acc] = await p.query(
  `SELECT *
     FROM driver_accessorials
    WHERE driver_id = ?
      AND settlement_week_start = ?
      AND settlement_week_end = ?
    ORDER BY id`,
  [id, start, end]
);
console.log('\n=== ACCESSORIALS settlement W43 ===');
let accSum = 0;
for (const a of acc) {
  accSum += Number(a.amount || 0);
  console.log(a);
}
console.log('accessorial sum', accSum);

// Also any accessorials without settlement week filter
const [accAll] = await p.query(
  `SELECT id, load_id, category, amount, settlement_week_start, settlement_week_end
     FROM driver_accessorials
    WHERE driver_id = ?
      AND (
        (settlement_week_start = ? AND settlement_week_end = ?)
        OR (DATE(COALESCE(settlement_week_start, '1970-01-01')) BETWEEN ? AND ?)
      )
    ORDER BY id`,
  [id, start, end, start, end]
);
console.log('accessorials alt', accAll);

console.log('\nRATE CHECK');
console.log({
  gp_miles_x_065: Number((2553.21 * 0.65).toFixed(2)),
  or_miles_2543_2_x_065: Number((2543.2 * 0.65).toFixed(2)),
  or_earnings: 1522.76,
  or_implied_rate: Number((1522.76 / 2543.2).toFixed(4)),
  gp_pay: 1659.59,
  delta_gp_minus_or: Number((1659.59 - 1522.76).toFixed(2)),
  mile_delta: Number((2553.21 - 2543.2).toFixed(2)),
});

// How GP computes pay
const c = comp[0] || {};
const emptyMiles = Math.max(0, Number(r?.mileage || miles) - loaded);
let payBase = 0;
if (c.status === 'Per Mile') {
  const lr = Number(c.loaded_mile_rate || 0);
  const er = Number(c.empty_mile_rate ?? c.loaded_mile_rate ?? 0);
  const gpLoaded = Number(r?.mileage) - emptyMiles; // approximate from parts
  // use parts loaded/empty with stored mileage split
  const storeMi = Number(r?.mileage || 0);
  const storeLoaded = loaded; // from parts
  const storeEmpty = Math.max(0, storeMi - storeLoaded);
  payBase = storeLoaded * lr + storeEmpty * er;
  console.log('\nPer Mile calc', {
    loadedRate: lr,
    emptyRate: er,
    storeMi,
    storeLoaded,
    storeEmpty,
    payBase,
  });
} else if (c.status === 'Percentage') {
  payBase = (Number(r?.gross_income || 0) * Number(c.linehaul_percentage || 0)) / 100;
  console.log('\nPercentage calc', {
    gross: r?.gross_income,
    pct: c.linehaul_percentage,
    payBase,
  });
} else if (c.status === 'Flat') {
  payBase = Number(c.flat_rate || 0);
}

console.log('\nCOMPARE', {
  openroad_mileage_pay: shotMileagePay,
  openroad_extra_mile: shotExtraMile,
  openroad_total_earnings: shotEarnings,
  gp_drivers_pay: Number(r?.drivers_pay),
  gp_pay_recomputed: Math.round((payBase + accSum) * 100) / 100,
  delta_vs_openroad: Number(r?.drivers_pay) - shotEarnings,
});

// Also list loads by gp that might match screenshot company loads if we can find by dates/amounts
const [weekLoads] = await p.query(
  `SELECT l.id, l.gp_load, l.status, l.driver_id, l.driver_count,
          l.miles, l.empty_miles,
          COALESCE(lf.linehaul_rate, l.linehaul_rate, l.revenue, 0) AS linehaul,
          l.pickup_at, l.delivery_at
     FROM loads l
     LEFT JOIN load_financials lf ON lf.load_id = l.id
    WHERE l.driver_id = ?
      AND DATE(l.delivery_at) BETWEEN ? AND ?
    ORDER BY l.delivery_at`,
  [id, start, end]
);
console.log('\n=== Loads assigned to Moreland delivery W43 ===');
for (const l of weekLoads) {
  console.log({
    id: l.id,
    gp: l.gp_load,
    count: Number(l.driver_count),
    miles: Number(l.miles),
    empty: Number(l.empty_miles),
    linehaul: Number(l.linehaul),
    del: l.delivery_at,
  });
}

await p.end();
