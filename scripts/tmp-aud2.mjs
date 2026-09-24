import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const { getPool } = await import("../lib/db.ts");
const { weekRange } = await import("../lib/week.ts");
const pool = getPool();
const { start, end } = weekRange(2026, 34);
const id = 35896;

const [routes] = await pool.query(`
  SELECT dr.load_id, dr.loaded_miles, dr.empty_miles, dr.revenue,
         l.driver_id owner_id, l.linehaul_rate, l.miles, l.empty_miles lem,
         l.delivery_at, l.pickup_at,
         DATE(l.delivery_at) deliv_date
    FROM driver_routes dr
    JOIN loads l ON l.id = dr.load_id
   WHERE dr.driver_id = ?
`, [id]);
console.log("all routes for Audrius", routes);

// replicate weeklySummary multi helper: route week = ? need how date is determined
// Read SQL from weeklySummary for helper week field
