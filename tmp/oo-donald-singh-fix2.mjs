import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
import { getPool } from "../lib/db.ts";
import { weekRange } from "../lib/week.ts";
import { syncRelayFuelForWeek } from "../lib/relay/syncFuel.ts";

const pool = getPool();
const { start, end } = weekRange(2026, 45);
const donaldId = 5168;
const singhId = 35540;

// All Donald routes in/near W45
const [routes] = await pool.query(
  `SELECT dr.load_id, l.gp_load, dr.driver_id, dr.loaded_miles, dr.empty_miles, dr.revenue,
          l.driver_id AS primary_id, l.helper_driver_id, l.driver_count,
          l.delivery_at, lf.linehaul_rate,
          DATE(COALESCE(dr.source_created_at, dr.source_updated_at)) AS route_day
     FROM driver_routes dr
     JOIN loads l ON l.id = dr.load_id
     LEFT JOIN load_financials lf ON lf.load_id = l.id
    WHERE dr.driver_id = ?
      AND (
        DATE(l.delivery_at) BETWEEN ? AND ?
        OR DATE(COALESCE(dr.source_created_at, dr.source_updated_at)) BETWEEN ? AND ?
      )
    ORDER BY l.delivery_at, dr.id`,
  [donaldId, start, end, start, end]
);
console.log("Donald W45-ish routes", routes);

// Re-sync Relay W45 for Singh and also try a wider pull
console.log("\nresync relay W45…");
const r45 = await syncRelayFuelForWeek(2026, 45);
console.log(r45);
const [rf] = await pool.query(
  `SELECT * FROM relay_fuel_week_totals WHERE driver_id=? AND week=45`,
  [singhId]
);
console.log("Singh after resync", rf[0]);

// Check relay raw if we store txns
const [tables] = await pool.query(`SHOW TABLES LIKE '%relay%'`);
console.log("relay tables", tables);

await pool.end();
process.exit(0);
