import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
import { getPool } from "../lib/db.ts";
import { fetchOpenRoadJson } from "../lib/openroad/client.ts";

const BASE = "https://app.openroadtms.com/api/ext/v1";
const pool = getPool();

const [cols] = await pool.query(`SHOW COLUMNS FROM driver_accessorials`);
console.log(
  "accessorial cols",
  cols.map((c) => c.Field).join(", ")
);

const [rows] = await pool.query(`
  SELECT *
  FROM driver_accessorials
  WHERE LOWER(category) LIKE '%detention%'
  ORDER BY id DESC
  LIMIT 3
`);
console.log("DB detention accessorials", rows);

for (const r of rows) {
  try {
    const j = await fetchOpenRoadJson(`${BASE}/load_financials/${r.load_id}`);
    const data = j?.data ?? j;
    console.log(
      "\nload",
      r.load_id,
      "linehaul",
      data.linehaul_rate,
      "detention_sum",
      data.detention_sum,
      "accessorials n=",
      (data.driver_accessorials || []).length
    );
    console.log(JSON.stringify(data.driver_accessorials ?? [], null, 2).slice(0, 2000));
  } catch (e) {
    console.log("FAIL lf", r.load_id, e.message.slice(0, 120));
  }
}

// Elias DB route revenue vs LF
const [eroutes] = await pool.query(`
  SELECT id, load_id, driver_id, loaded_miles, empty_miles, revenue
  FROM driver_routes WHERE load_id=2355803
`);
console.log("\nElias DB routes", eroutes);

const [elf] = await pool.query(
  `SELECT * FROM load_financials WHERE load_id=2355803`
);
console.log("Elias DB LF", elf[0]);

// pay statement single get by constructed id
for (const id of ["39422_2026-10-20", "39422_2026-10-19", "39422_2026-10-13"]) {
  try {
    const j = await fetchOpenRoadJson(`${BASE}/driver_pay_statements/${id}`);
    console.log("\npay stmt", id, JSON.stringify(j, null, 2).slice(0, 1000));
  } catch (e) {
    console.log("\npay stmt", id, "FAIL", e.message.slice(0, 160));
  }
}

await pool.end();
