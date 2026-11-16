import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
import mysql from "mysql2/promise";
import { fetchOpenRoadJson } from "../lib/openroad/client.ts";

const p = await mysql.createConnection(process.env.DATABASE_URL);

// Live financials for mismatched loads
const loads = [
  { gp: "2610-00478", orSs: 3900 }, // Elias
  { gp: "2610-00828", orSs: 3000 }, // Evariste
  { gp: "2610-00575", orSs: 850 }, // Wimmer
];

for (const { gp, orSs } of loads) {
  const [row] = await p.query(
    `SELECT l.id, l.gp_load, l.driver_count, l.helper_driver_id,
            lf.linehaul_rate, lf.total, lf.detention_sum, lf.fuel_surcharge
       FROM loads l LEFT JOIN load_financials lf ON lf.load_id=l.id
      WHERE l.gp_load=?`,
    [gp]
  );
  const id = row[0]?.id;
  console.log("\n", gp, "DB", row[0], "SS", orSs);
  if (!id) continue;
  try {
    const url = `https://app.openroadtms.com/api/ext/v1/load_financials/${id}`;
    const j = await fetchOpenRoadJson(url);
    const d = j?.data || j;
    console.log("API keys", Object.keys(d || {}).slice(0, 40));
    console.log("API lh fields", {
      linehaul_rate: d.linehaul_rate,
      total: d.total,
      revenue: d.revenue,
      detention_sum: d.detention_sum,
      fuel_surcharge: d.fuel_surcharge,
      driver_id: d.driver_id,
    });
  } catch (e) {
    console.log("API err", e.message);
  }
  const [rts] = await p.query(
    `SELECT driver_id, loaded_miles, empty_miles, revenue,
            DATE(COALESCE(source_created_at,source_updated_at)) rd
       FROM driver_routes WHERE load_id=?`,
    [id]
  );
  console.log("routes", rts);
}

// Moreland W44: list his 2610 loads and compare to SS targets mi 2246.61 / gross 5700
const [m] = await p.query(
  `SELECT driver_id FROM gross_profit_reports WHERE year=2026 AND week=44 AND driver_name LIKE '%Moreland%'`
);
const mid = m[0].driver_id;
const [ml] = await p.query(
  `SELECT l.gp_load, DATE(l.delivery_at) del, l.driver_count,
          COALESCE(lf.linehaul_rate,0) lh, COALESCE(lf.detention_sum,0) det,
          COALESCE(l.miles,0)+COALESCE(l.empty_miles,0) load_mi
     FROM loads l LEFT JOIN load_financials lf ON lf.load_id=l.id
    WHERE l.driver_id=? AND DATE(l.delivery_at) BETWEEN '2026-10-20' AND '2026-10-26'
    ORDER BY l.delivery_at`,
  [mid]
);
console.log("\nMoreland W44 owned", ml);

// Search gp_load patterns that might match Pooler settlement loads from SS
// From first description: revenue 1450,1300,1400,1350,2200 = 5700
const [byLh] = await p.query(
  `SELECT l.gp_load, l.driver_id, d.first_name, d.last_name, DATE(l.delivery_at) del,
          lf.linehaul_rate, lf.detention_sum
     FROM loads l
     LEFT JOIN load_financials lf ON lf.load_id=l.id
     LEFT JOIN drivers d ON d.id=l.driver_id
    WHERE DATE(l.delivery_at) BETWEEN '2026-10-20' AND '2026-10-26'
      AND lf.linehaul_rate IN (1450,1300,1400,1350,2200,5700)
    ORDER BY lf.linehaul_rate`
);
console.log("loads with Moreland-SS-like LH", byLh);

await p.end();
