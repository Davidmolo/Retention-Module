import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
import { getPool } from "../lib/db.ts";

const pool = getPool();
const id = 7329;
const [routes] = await pool.query(
  `SELECT dr.id, dr.load_id, dr.driver_id, dr.loaded_miles, dr.empty_miles, dr.revenue,
          l.gp_load, l.status, l.driver_id AS load_primary, l.helper_driver_id,
          lf.linehaul_rate, l.delivery_at
     FROM driver_routes dr
     JOIN loads l ON l.id = dr.load_id
     LEFT JOIN load_financials lf ON lf.load_id = l.id
    WHERE dr.driver_id = ?
      AND l.delivery_at >= '2026-10-20'
      AND l.delivery_at < '2026-10-27'
    ORDER BY l.delivery_at`,
  [id]
);
console.log("Cheryl routes W44", routes);
if (routes.length) {
  const [allOnLoads] = await pool.query(
    `SELECT dr.load_id, dr.driver_id, d.name, dr.loaded_miles, dr.revenue,
            l.driver_id AS primary_id, l.helper_driver_id
       FROM driver_routes dr
       JOIN loads l ON l.id = dr.load_id
       LEFT JOIN drivers d ON d.id = dr.driver_id
      WHERE dr.load_id IN (?)
      ORDER BY dr.load_id, dr.id`,
    [routes.map((r) => r.load_id)]
  );
  console.log("teammates", allOnLoads);
}
await pool.end();
process.exit(0);
