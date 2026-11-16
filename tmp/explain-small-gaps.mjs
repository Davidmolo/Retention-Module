import nextEnv from '@next/env';
import mysql from 'mysql2/promise';

nextEnv.loadEnvConfig(process.cwd());
const p = await mysql.createPool(process.env.DATABASE_URL);

const FINAL = `
  AND dr.id = (
    SELECT dr_latest.id FROM driver_routes dr_latest
     WHERE dr_latest.load_id = dr.load_id AND dr_latest.driver_id = dr.driver_id
     ORDER BY COALESCE(dr_latest.source_created_at, dr_latest.source_updated_at) DESC, dr_latest.id DESC
     LIMIT 1
  )
  AND NOT EXISTS (
    SELECT 1 FROM driver_routes dr_newer
     WHERE dr_newer.load_id = dr.load_id
       AND dr_newer.position_from <=> dr.position_from
       AND dr_newer.position_to <=> dr.position_to
       AND (
         COALESCE(dr_newer.source_created_at, dr_newer.source_updated_at)
           > COALESCE(dr.source_created_at, dr.source_updated_at)
         OR (
           COALESCE(dr_newer.source_created_at, dr_newer.source_updated_at)
             <=> COALESCE(dr.source_created_at, dr.source_updated_at)
           AND dr_newer.id > dr.id
         )
       )
  )`;

async function parts(id, start, end) {
  const [rows] = await p.query(
    `
    SELECT 'solo' AS part, l.id load_id, l.gp_load,
           COALESCE(l.miles,0) loaded, COALESCE(l.empty_miles,0) empty_mi,
           COALESCE(l.miles,0)+COALESCE(l.empty_miles,0) total
      FROM loads l
     WHERE l.driver_id=? AND DATE(l.delivery_at) BETWEEN ? AND ?
       AND COALESCE(l.driver_count,0)<2
       AND LOWER(TRIM(COALESCE(l.status,'')))<>'canceled'
    UNION ALL
    SELECT 'helper', l.id, l.gp_load,
           COALESCE(dr.loaded_miles,0), COALESCE(dr.empty_miles,0),
           COALESCE(dr.loaded_miles,0)+COALESCE(dr.empty_miles,0)
      FROM driver_routes dr
      JOIN loads l ON l.id=dr.load_id
     WHERE dr.driver_id=?
       AND l.driver_id IS NOT NULL AND l.driver_id<>dr.driver_id
       AND DATE(COALESCE(dr.source_created_at, dr.source_updated_at)) BETWEEN ? AND ?
       AND COALESCE(l.driver_count,0)>=2
       ${FINAL}
    UNION ALL
    SELECT 'owner', l.id, l.gp_load,
           COALESCE(dr.loaded_miles,0), COALESCE(dr.empty_miles,0),
           COALESCE(dr.loaded_miles,0)+COALESCE(dr.empty_miles,0)
      FROM driver_routes dr
      JOIN loads l ON l.id=dr.load_id
     WHERE dr.driver_id=?
       AND l.driver_id=dr.driver_id
       AND DATE(l.delivery_at) BETWEEN ? AND ?
       AND COALESCE(l.driver_count,0)>=2
       ${FINAL}
    `,
    [id, start, end, id, start, end, id, start, end]
  );
  return rows;
}

const start = '2026-10-13';
const end = '2026-10-19';

console.log('\n===== DEANDRE (screenshot L 1583.6 E 463.3 Total 2046.9) =====');
console.log('SS: empty 399.1 + load 1250.76 + empty 64.2 + load 332.8 = 2046.86');
const deandre = await parts(39423, start, end);
let dL = 0,
  dE = 0;
for (const r of deandre) {
  const loaded = Number(r.loaded);
  const empty = Number(r.empty_mi);
  dL += loaded;
  dE += empty;
  console.log({
    part: r.part,
    gp: r.gp_load,
    loaded,
    empty,
    total: Number(r.total),
  });
}
console.log('GP sum', { loaded: dL, empty: dE, total: dL + dE });
console.log('vs SS', {
  ss: 2046.9,
  gp: dL + dE,
  delta: Number((dL + dE - 2046.9).toFixed(2)),
});

// load-level for 00447 and route for 00565
const [dLoads] = await p.query(
  `SELECT gp_load, miles, empty_miles FROM loads WHERE gp_load IN ('2610-00447','2610-00565')`
);
console.log('load table', dLoads);
const [dRoutes] = await p.query(
  `SELECT dr.id, l.gp_load, dr.loaded_miles, dr.empty_miles, dr.source_created_at,
          dr.destination_from_id, dr.destination_to_id
     FROM driver_routes dr JOIN loads l ON l.id=dr.load_id
    WHERE l.gp_load='2610-00565' AND dr.driver_id=39423
    ORDER BY dr.source_created_at`
);
console.log('Deandre routes on 00565', dRoutes);

console.log('\n===== MORGAN (screenshot L 1690.9 E 180.2 Total 1871.1) =====');
console.log('SS: 92.3+407.49+87.9+298.38+0+984.99 = 1871.06');
const morgan = await parts(39073, start, end);
let mL = 0,
  mE = 0;
for (const r of morgan) {
  const loaded = Number(r.loaded);
  const empty = Number(r.empty_mi);
  mL += loaded;
  mE += empty;
  console.log({
    part: r.part,
    gp: r.gp_load,
    loaded,
    empty,
    total: Number(r.total),
  });
}
console.log('GP sum', { loaded: mL, empty: mE, total: mL + mE });
console.log('vs SS', {
  ss: 1871.1,
  gp: mL + mE,
  delta: Number((mL + mE - 1871.1).toFixed(2)),
});

const [mLoads] = await p.query(
  `SELECT gp_load, miles, empty_miles, driver_id, driver_count
     FROM loads WHERE gp_load IN ('2610-00569','2610-00575','2610-00371','2610-00659')`
);
console.log('morgan loads', mLoads);
const [mRoutes] = await p.query(
  `SELECT dr.id, l.gp_load, dr.driver_id, dr.loaded_miles, dr.empty_miles, dr.source_created_at
     FROM driver_routes dr JOIN loads l ON l.id=dr.load_id
    WHERE l.gp_load IN ('2610-00575','2610-00371') AND dr.driver_id=39073
    ORDER BY l.gp_load, dr.source_created_at`
);
console.log('morgan final-ish routes', mRoutes);

await p.end();
