import nextEnv from '@next/env';
import mysql from 'mysql2/promise';

nextEnv.loadEnvConfig(process.cwd());
const p = await mysql.createPool(process.env.DATABASE_URL);

const [drv] = await p.query(
  `SELECT id, first_name, last_name FROM drivers
    WHERE last_name LIKE '%Mcgrew%' AND first_name LIKE '%Morgan%'`
);
console.log('DRIVER', drv);
const id = drv[0]?.id;
const start = '2026-10-13';
const end = '2026-10-19';

const [rep] = await p.query(
  `SELECT mileage, trips, gross_income, unit FROM gross_profit_reports
    WHERE year=2026 AND week=43 AND driver_id=?`,
  [id]
);
console.log('GP REPORT', rep);

const shotGps = ['2610-00569', '2610-00575', '2610-00371'];
const [shotLoads] = await p.query(
  `SELECT l.id, l.gp_load, l.status, l.driver_id, l.driver_count,
          l.miles, l.empty_miles, l.pickup_at, l.delivery_at
     FROM loads l WHERE l.gp_load IN (?)`,
  [shotGps]
);
console.log('\n=== Screenshot company loads in DB ===');
for (const r of shotLoads) {
  console.log({
    id: r.id,
    gp: r.gp_load,
    status: r.status,
    driver: r.driver_id,
    count: Number(r.driver_count),
    miles: Number(r.miles),
    empty: Number(r.empty_miles),
    total: Number(r.miles || 0) + Number(r.empty_miles || 0),
    pu: r.pickup_at,
    del: r.delivery_at,
  });
}

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

console.log('\n=== GP CREDITED PARTS ===');
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
    count: Number(r.driver_count),
    loaded,
    empty,
    total: loaded + empty,
    week_date: String(r.week_date),
    week_by: r.week_by,
  });
}
console.log('\nGP sum L/E/Total', L, E, L + E);
console.log(
  'Screenshot Total 1871.1 | GP stored',
  Number(rep[0]?.mileage),
  '| delta',
  Number(rep[0]?.mileage) - 1871.1
);

// For any multi-driver / multi-route loads credited, dump all routes
const loadIds = [...new Set(parts.map((r) => Number(r.load_id)))];
if (loadIds.length) {
  const [routes] = await p.query(
    `SELECT dr.id, dr.load_id, l.gp_load, dr.driver_id,
            TRIM(CONCAT_WS(' ', d.first_name, d.last_name)) AS name,
            dr.loaded_miles, dr.empty_miles, dr.route_type,
            dr.destination_from_id, dr.destination_to_id,
            dr.position_from, dr.position_to,
            dr.source_created_at, dr.source_updated_at
       FROM driver_routes dr
       JOIN loads l ON l.id = dr.load_id
       LEFT JOIN drivers d ON d.id = dr.driver_id
      WHERE dr.load_id IN (?)
      ORDER BY dr.load_id, COALESCE(dr.source_created_at, dr.id)`,
    [loadIds]
  );
  console.log('\n=== ALL routes on GP-credited loads ===');
  for (const r of routes) {
    console.log({
      gp: r.gp_load,
      routeId: r.id,
      driver: r.driver_id,
      name: r.name,
      loaded: Number(r.loaded_miles),
      empty: Number(r.empty_miles),
      total: Number(r.loaded_miles || 0) + Number(r.empty_miles || 0),
      type: r.route_type,
      pos: `${r.position_from}->${r.position_to}`,
      dest: `${r.destination_from_id}->${r.destination_to_id}`,
      created: r.source_created_at,
    });
  }
}

await p.end();
