// Re-link fuel_transactions (+ trips) to the drivers roster by NAME / unit.
// Re-runnable. Run after driver / fuel syncs — also runs automatically after
// every .dat import (see lib/dat/importFuel.ts).
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());

const { linkFuelDrivers } = await import('../lib/dat/linkFuelDrivers.ts');
const mysql = await import('mysql2/promise');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const norm = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');

const conn = await mysql.createConnection(url);
try {
  const [drv] = await conn.query(
    'SELECT id, first_name, middle_name, last_name FROM drivers'
  );
  const names = drv.map((d) => ({
    id: d.id,
    full: norm(
      [d.first_name, d.middle_name, d.last_name].filter(Boolean).join(' ')
    ),
    fl: norm([d.first_name, d.last_name].filter(Boolean).join(' ')),
  }));
  const exact = new Map();
  for (const n of names) {
    for (const k of [n.full, n.fl]) if (k && !exact.has(k)) exact.set(k, n.id);
  }

  // Trips — exact name match.
  const [trips] = await conn.query(
    "SELECT DISTINCT driver_name FROM trips WHERE driver_name IS NOT NULL AND driver_name <> ''"
  );
  let tRows = 0;
  let tMatched = 0;
  for (const { driver_name } of trips) {
    const id = exact.get(norm(driver_name));
    if (!id) continue;
    tMatched += 1;
    const [r] = await conn.query(
      'UPDATE trips SET driver_id = ? WHERE driver_name = ?',
      [id, driver_name]
    );
    tRows += r.affectedRows;
  }

  console.log(
    `trips: matched ${tMatched}/${trips.length} names -> ${tRows} rows linked`
  );
} finally {
  await conn.end();
}

const fuel = await linkFuelDrivers();
console.log(
  `fuel:  name-linked ${fuel.nameLinked} rows, unit-linked ${fuel.unitLinked} rows`
);
process.exit(0);
