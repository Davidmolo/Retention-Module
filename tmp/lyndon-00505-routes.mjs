import nextEnv from '@next/env';
import mysql from 'mysql2/promise';

nextEnv.loadEnvConfig(process.cwd());
const p = await mysql.createPool(process.env.DATABASE_URL);

const loadId = 2357149; // 2610-00505

const [load] = await p.query(
  `SELECT id, gp_load, status, driver_id, driver_count, miles, empty_miles,
          pickup_at, delivery_at, source_created_at, source_updated_at
     FROM loads WHERE id = ?`,
  [loadId]
);
console.log('LOAD', load[0]);

const [routes] = await p.query(
  `SELECT dr.*,
          TRIM(CONCAT_WS(' ', d.first_name, d.last_name)) AS name
     FROM driver_routes dr
     LEFT JOIN drivers d ON d.id = dr.driver_id
    WHERE dr.load_id = ?
    ORDER BY COALESCE(dr.source_created_at, dr.id)`,
  [loadId]
);
console.log('\nALL driver_routes rows for this load:');
for (const r of routes) {
  console.log({
    id: r.id,
    driver_id: r.driver_id,
    name: r.name,
    loaded_miles: Number(r.loaded_miles),
    empty_miles: Number(r.empty_miles),
    revenue: r.revenue,
    source_created_at: r.source_created_at,
    source_updated_at: r.source_updated_at,
    // dump any other useful cols
    keys: Object.keys(r).filter(
      (k) => !['id', 'driver_id', 'name', 'loaded_miles', 'empty_miles', 'revenue', 'source_created_at', 'source_updated_at', 'load_id'].includes(k)
    ),
  });
}

// show full row for Lyndon's three
const lyndon = routes.filter((r) => Number(r.driver_id) === 39465);
console.log('\nLYNDON rows full:');
for (const r of lyndon) {
  const copy = { ...r };
  delete copy.keys;
  console.log(copy);
}

await p.end();
