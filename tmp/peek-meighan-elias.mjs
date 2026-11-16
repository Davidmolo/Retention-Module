import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());
const mysql = (await import('mysql2/promise')).default;
const p = await mysql.createConnection(process.env.DATABASE_URL);

const [r] = await p.query(
  `SELECT dr.id, dr.load_id, dr.driver_id, dr.loaded_miles, dr.empty_miles, dr.revenue,
          dr.source_created_at, dr.source_updated_at,
          l.driver_id AS load_driver, l.helper_driver_id, l.driver_count, l.delivery_at, l.status
     FROM driver_routes dr
     JOIN loads l ON l.id = dr.load_id
    WHERE dr.driver_id = 39423 AND dr.load_id = 2352461
    ORDER BY dr.id`
);
console.log('Meighan routes 2352461', r);

const [l] = await p.query(
  `SELECT id, driver_id, helper_driver_id, driver_count, miles, empty_miles, delivery_at, status
     FROM loads WHERE id IN (2352461,2354402,2359696)`
);
console.log('Meighan loads', l);

// Helper week filter: DATE(source_created_at) for helpers
const [h] = await p.query(
  `SELECT dr.load_id, dr.driver_id, DATE(dr.source_created_at) c, DATE(dr.source_updated_at) u,
          DATE(l.delivery_at) del, l.driver_id load_drv, l.driver_count
     FROM driver_routes dr JOIN loads l ON l.id = dr.load_id
    WHERE dr.load_id = 2352461`
);
console.log('all routes on 2352461', h);

const [acc] = await p.query(
  `SELECT driver_id, category, amount, load_id, note
     FROM driver_accessorials
    WHERE driver_id IN (39423,40131,37886,38499,35669,18754,40249,37820,39073,39422)
      AND settlement_week_start='2026-10-13'`
);
console.log(
  'acc',
  acc.map((a) => ({
    d: a.driver_id,
    cat: a.category,
    amt: a.amount,
    load: a.load_id,
    note: a.note,
  }))
);

// Elias: GP 10801 vs rebuild 9901 — missing 900
const [eLoads] = await p.query(
  `SELECT l.id, l.driver_id, l.helper_driver_id, l.driver_count,
          lf.linehaul_rate, lf.detention_sum, l.miles, l.empty_miles
     FROM loads l LEFT JOIN load_financials lf ON lf.load_id=l.id
    WHERE l.id IN (2348929,2354970,2355804,2361976,2363852)`
);
console.log('Elias loads', eLoads);
const [eRoutes] = await p.query(
  `SELECT dr.load_id, dr.driver_id, dr.revenue, dr.loaded_miles, dr.empty_miles,
          l.driver_id load_drv, l.driver_count
     FROM driver_routes dr JOIN loads l ON l.id=dr.load_id
    WHERE dr.driver_id=39422 AND DATE(l.delivery_at) BETWEEN '2026-10-13' AND '2026-10-19'`
);
console.log('Elias routes', eRoutes);

// What is 900? Maybe detention on a load
const [det] = await p.query(
  `SELECT load_id, detention_sum, linehaul_rate FROM load_financials
    WHERE load_id IN (2348929,2354970,2355804,2361976,2363852)`
);
console.log('elias fin', det);

await p.end();
