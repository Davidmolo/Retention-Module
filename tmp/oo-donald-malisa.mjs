import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
import { getPool } from "../lib/db.ts";

const p = getPool();
const [d2] = await p.query(
  `SELECT l.id,l.gp_load,l.status,l.miles,l.empty_miles,l.delivery_at,lf.linehaul_rate
     FROM loads l LEFT JOIN load_financials lf ON lf.load_id=l.id
    WHERE l.driver_id=5168 AND l.delivery_at >= '2026-10-20' AND l.delivery_at < '2026-11-15'
    ORDER BY l.delivery_at`
);
console.log("Donald Oct20-Nov15", d2);

const [mal] = await p.query(
  `SELECT dr.driver_id, dr.loaded_miles, dr.empty_miles, dr.revenue, dr.source_created_at
     FROM driver_routes dr WHERE dr.load_id=2394301`
);
console.log("01127 routes", mal);

const [helper] = await p.query(
  `SELECT id, first_name, last_name, driver_type FROM drivers WHERE id IN (12119,39423,5168)`
).catch(async () => {
  const [c] = await p.query(`SHOW COLUMNS FROM drivers`);
  console.log("driver cols", c.map((x) => x.Field).join(","));
  return [[]];
});
console.log("drivers", helper);

await p.end();
process.exit(0);
