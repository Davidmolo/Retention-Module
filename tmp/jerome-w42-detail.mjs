import nextEnv from '@next/env';
import mysql from 'mysql2/promise';

nextEnv.loadEnvConfig(process.cwd());
const p = await mysql.createPool(process.env.DATABASE_URL);
const id = 38802;
const start = '2026-10-06';
const end = '2026-10-12';

const loadIds = [2349563]; // detention load - find all W42 loads
const [loads] = await p.query(
  `SELECT l.id, l.gp_load, l.status, l.driver_count, l.miles, l.empty_miles,
          COALESCE(lf.linehaul_rate,l.linehaul_rate,l.revenue,0) linehaul,
          lf.detention_sum, l.delivery_at
     FROM loads l
     LEFT JOIN load_financials lf ON lf.load_id=l.id
    WHERE l.driver_id=? AND DATE(l.delivery_at) BETWEEN ? AND ?
    ORDER BY l.delivery_at`,
  [id, start, end]
);
console.log('LOADS');
for (const l of loads) {
  console.log({
    id: l.id,
    gp: l.gp_load,
    count: Number(l.driver_count),
    miles: Number(l.miles),
    empty: Number(l.empty_miles),
    total: Number(l.miles || 0) + Number(l.empty_miles || 0),
    linehaul: Number(l.linehaul),
    detention_sum: Number(l.detention_sum || 0),
    del: l.delivery_at,
  });
}

const ids = loads.map((l) => l.id);
const [routes] = await p.query(
  `SELECT dr.id, dr.load_id, l.gp_load, dr.driver_id,
          TRIM(CONCAT_WS(' ', d.first_name, d.last_name)) name,
          dr.loaded_miles, dr.empty_miles, dr.route_type,
          dr.source_created_at
     FROM driver_routes dr
     JOIN loads l ON l.id=dr.load_id
     LEFT JOIN drivers d ON d.id=dr.driver_id
    WHERE dr.load_id IN (?)
    ORDER BY dr.load_id, dr.source_created_at`,
  [ids]
);
console.log('\nROUTES on those loads');
for (const r of routes) {
  console.log({
    gp: r.gp_load,
    route: r.id,
    driver: r.driver_id,
    name: r.name,
    loaded: Number(r.loaded_miles),
    empty: Number(r.empty_miles),
    total: Number(r.loaded_miles || 0) + Number(r.empty_miles || 0),
    type: r.route_type,
    created: r.source_created_at,
  });
}

const [acc] = await p.query(
  `SELECT * FROM driver_accessorials WHERE id=2312932 OR (driver_id=? AND settlement_week_start=?)`,
  [id, start]
);
console.log('\nACC detail', acc);

// Recompute
const miles = 2934.58;
const rate = 0.68;
const accAmt = 125;
console.log('\nBREAKDOWN');
console.log({
  gp_miles: miles,
  mile_pay: Number((miles * rate).toFixed(2)),
  detention_accessorial: accAmt,
  gp_drivers_pay: Number((miles * rate + accAmt).toFixed(2)),
  sheet_pay: 1995.52,
  sheet_missing: 'sheet = mile pay only; no $125 detention',
  openroad_total_earnings_approx: 2165.93,
  gap_or_minus_gp: Number((2165.93 - (miles * rate + accAmt)).toFixed(2)),
});

await p.end();
