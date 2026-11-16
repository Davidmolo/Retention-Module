import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
import { getPool } from "../lib/db.ts";
const pool = getPool();
const [a] = await pool.query(
  `SELECT * FROM driver_accessorials WHERE load_id = 2391342`
);
console.log("01088 accessorials", a);
const [r] = await pool.query(
  `SELECT id, driver_id, loaded_miles, empty_miles, revenue, position_from, position_to,
          source_created_at
     FROM driver_routes WHERE load_id = 2391342 ORDER BY id`
);
console.log("01088 routes", r);
await pool.end();
process.exit(0);
