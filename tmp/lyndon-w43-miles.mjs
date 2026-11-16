import nextEnv from '@next/env';
import mysql from 'mysql2/promise';

nextEnv.loadEnvConfig(process.cwd());
const p = await mysql.createPool(process.env.DATABASE_URL);

const [drv] = await p.query(
  `SELECT id, first_name, last_name FROM drivers
    WHERE last_name LIKE '%Smith%' AND first_name LIKE '%Lyndon%'`
);
console.log('DRIVER', drv);
const id = drv[0]?.id;
const start = '2026-10-13';
const end = '2026-10-19';

const [loads] = await p.query(
  `SELECT l.id, l.gp_load, l.status, l.driver_id, l.driver_count,
          l.miles, l.empty_miles,
          l.pickup_at, l.delivery_at
     FROM loads l
    WHERE l.driver_id = ?
      AND DATE(l.delivery_at) BETWEEN ? AND ?
    ORDER BY l.delivery_at`,
  [id, start, end]
);
console.log('\n=== SOLO LOADS credited (driver_id=Lyndon, delivery in W43) ===');
let soloLoaded = 0;
let soloEmpty = 0;
for (const r of loads) {
  const m = Number(r.miles || 0);
  const e = Number(r.empty_miles || 0);
  const canceled = String(r.status || '').toLowerCase() === 'canceled';
  const count = Number(r.driver_count || 0);
  const credit = !canceled && count < 2;
  if (credit) {
    soloLoaded += m;
    soloEmpty += e;
  }
  console.log({
    id: r.id,
    gp: r.gp_load,
    status: r.status,
    count,
    miles: m,
    empty: e,
    total: m + e,
    credited: credit,
    pu: r.pickup_at,
    del: r.delivery_at,
  });
}
console.log('Solo sum loaded/empty/total', soloLoaded, soloEmpty, soloLoaded + soloEmpty);

const [routes] = await p.query(
  `SELECT dr.load_id, l.gp_load, l.status, l.driver_id AS load_driver,
          l.driver_count, dr.driver_id AS route_driver,
          dr.loaded_miles, dr.empty_miles, dr.revenue,
          dr.source_created_at, dr.source_updated_at,
          l.delivery_at
     FROM driver_routes dr
     JOIN loads l ON l.id = dr.load_id
    WHERE dr.driver_id = ?
      AND (
        DATE(l.delivery_at) BETWEEN ? AND ?
        OR DATE(COALESCE(dr.source_created_at, dr.source_updated_at)) BETWEEN ? AND ?
      )
    ORDER BY COALESCE(dr.source_created_at, dr.source_updated_at)`,
  [id, start, end, start, end]
);
console.log('\n=== DRIVER_ROUTES touching W43 ===');
for (const r of routes) {
  const lm = Number(r.loaded_miles || 0);
  const em = Number(r.empty_miles || 0);
  const count = Number(r.driver_count || 0);
  const isHelper =
    r.load_driver != null &&
    Number(r.load_driver) !== Number(r.route_driver) &&
    count >= 2;
  const isOwner =
    r.load_driver != null &&
    Number(r.load_driver) === Number(r.route_driver) &&
    count >= 2;
  const isOrphan = r.load_driver == null && count === 1;
  console.log({
    load: r.load_id,
    gp: r.gp_load,
    status: r.status,
    count,
    loadDrv: r.load_driver,
    loaded: lm,
    empty: em,
    total: lm + em,
    role: isHelper ? 'helper' : isOwner ? 'owner' : isOrphan ? 'orphan' : 'other',
    routeCreated: r.source_created_at,
    del: r.delivery_at,
  });
}

// Reconstruct GP trip_parts logic for this driver
const [parts] = await p.query(
  `
  SELECT 'solo' AS part, l.id AS load_id, l.gp_load, l.status, l.driver_count,
         COALESCE(l.miles,0) AS loaded, COALESCE(l.empty_miles,0) AS empty_mi,
         DATE(l.delivery_at) AS week_date, 'delivery' AS week_by
    FROM loads l
   WHERE l.driver_id = ?
     AND DATE(l.delivery_at) BETWEEN ? AND ?
     AND COALESCE(l.driver_count, 0) < 2
     AND LOWER(TRIM(COALESCE(l.status,''))) <> 'canceled'
  UNION ALL
  SELECT 'orphan' AS part, l.id, l.gp_load, l.status, l.driver_count,
         CASE WHEN COALESCE(dr.loaded_miles,0)+COALESCE(dr.empty_miles,0)>0
              THEN COALESCE(dr.loaded_miles,0) ELSE COALESCE(l.miles,0) END,
         CASE WHEN COALESCE(dr.loaded_miles,0)+COALESCE(dr.empty_miles,0)>0
              THEN COALESCE(dr.empty_miles,0) ELSE COALESCE(l.empty_miles,0) END,
         DATE(l.delivery_at), 'delivery'
    FROM driver_routes dr
    JOIN loads l ON l.id = dr.load_id
   WHERE dr.driver_id = ?
     AND l.driver_id IS NULL
     AND DATE(l.delivery_at) BETWEEN ? AND ?
     AND COALESCE(l.driver_count, 0) = 1
     AND NOT (
       LOWER(TRIM(COALESCE(l.status,''))) = 'canceled'
       AND COALESCE(dr.loaded_miles,0)+COALESCE(dr.empty_miles,0) > 0
     )
  UNION ALL
  SELECT 'helper' AS part, l.id, l.gp_load, l.status, l.driver_count,
         COALESCE(dr.loaded_miles,0), COALESCE(dr.empty_miles,0),
         DATE(COALESCE(dr.source_created_at, dr.source_updated_at)), 'route'
    FROM driver_routes dr
    JOIN loads l ON l.id = dr.load_id
   WHERE dr.driver_id = ?
     AND l.driver_id IS NOT NULL
     AND l.driver_id <> dr.driver_id
     AND DATE(COALESCE(dr.source_created_at, dr.source_updated_at)) BETWEEN ? AND ?
     AND COALESCE(l.driver_count, 0) >= 2
  UNION ALL
  SELECT 'owner' AS part, l.id, l.gp_load, l.status, l.driver_count,
         COALESCE(dr.loaded_miles,0), COALESCE(dr.empty_miles,0),
         DATE(l.delivery_at), 'delivery'
    FROM driver_routes dr
    JOIN loads l ON l.id = dr.load_id
   WHERE dr.driver_id = ?
     AND l.driver_id = dr.driver_id
     AND DATE(l.delivery_at) BETWEEN ? AND ?
     AND COALESCE(l.driver_count, 0) >= 2
  `,
  [id, start, end, id, start, end, id, start, end, id, start, end]
);

console.log('\n=== GP CREDITED PARTS (same rules as weeklySummary) ===');
let L = 0,
  E = 0;
for (const r of parts) {
  const loaded = Number(r.loaded);
  const empty = Number(r.empty_mi);
  L += loaded;
  E += empty;
  console.log({
    part: r.part,
    load: r.load_id,
    gp: r.gp_load,
    status: r.status,
    count: r.driver_count,
    loaded,
    empty,
    total: loaded + empty,
    week_date: String(r.week_date),
    week_by: r.week_by,
  });
}

const [allRoutes00505] = await p.query(
  `SELECT dr.id, dr.driver_id,
          TRIM(CONCAT_WS(' ', d.first_name, d.last_name)) AS name,
          dr.loaded_miles, dr.empty_miles, dr.source_created_at
     FROM driver_routes dr
     LEFT JOIN drivers d ON d.id = dr.driver_id
    WHERE dr.load_id = 2357149
    ORDER BY dr.source_created_at`
);
console.log('\n=== ALL routes on split load 2610-00505 ===');
for (const r of allRoutes00505) {
  console.log({
    routeId: r.id,
    driver: r.driver_id,
    name: r.name,
    loaded: Number(r.loaded_miles),
    empty: Number(r.empty_miles),
    total: Number(r.loaded_miles || 0) + Number(r.empty_miles || 0),
    created: r.source_created_at,
  });
}
console.log('\nGP sum L/E/Total', L, E, L + E);

const [rep] = await p.query(
  `SELECT mileage, trips, gross_income FROM gross_profit_reports
    WHERE year=2026 AND week=43 AND driver_id=?`,
  [id]
);
console.log('STORED REPORT', rep);

// Also show the 4 company loads from the screenshot by gp_load
const gps = ['2610-00429', '2610-00505', '2610-00623', '2610-00626'];
const [shot] = await p.query(
  `SELECT l.id, l.gp_load, l.status, l.driver_id, l.driver_count,
          l.miles, l.empty_miles, l.pickup_at, l.delivery_at
     FROM loads l WHERE l.gp_load IN (?)`,
  [gps]
);
console.log('\n=== Screenshot company loads in DB ===');
for (const r of shot) {
  console.log({
    id: r.id,
    gp: r.gp_load,
    status: r.status,
    driver: r.driver_id,
    count: r.driver_count,
    miles: Number(r.miles),
    empty: Number(r.empty_miles),
    total: Number(r.miles || 0) + Number(r.empty_miles || 0),
    pu: r.pickup_at,
    del: r.delivery_at,
  });
}

await p.end();
