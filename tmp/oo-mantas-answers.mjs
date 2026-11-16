import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
import { getPool } from "../lib/db.ts";
import { weekRange } from "../lib/week.ts";
import { fetchOpenRoadJson } from "../lib/openroad/client.ts";
import { getWeeklySummary } from "../lib/sources/weeklySummary.ts";

const pool = getPool();
const BASE = "https://app.openroadtms.com/api/ext/v1";
const { start, end } = weekRange(2026, 45);
console.log("W45", start, end);

const summary = await getWeeklySummary(2026, 45);
const donald = summary.drivers.find((d) => /^donald\s+smith$/i.test(d.name.trim()));
const singh = summary.drivers.find((d) => /manpreet/i.test(d.name));
const day = summary.drivers.find((d) => /cheryl\s+day/i.test(d.name));
const malisa = summary.drivers.find((d) => /malisa/i.test(d.name));

console.log("\nDonald live", donald && { mi: donald.mileage, lh: donald.grossIncome, fuel: donald.fuel });
console.log("target LH 6232.43 mi 2360 — gap LH", donald ? 6232.43 - donald.grossIncome : null);

// Donald loads wider window + any 2200 LH
const [dLoads] = await pool.query(
  `SELECT l.id,l.gp_load,l.status,l.driver_id,l.helper_driver_id,l.driver_count,
          l.miles,l.empty_miles,l.delivery_at,lf.linehaul_rate
     FROM loads l LEFT JOIN load_financials lf ON lf.load_id=l.id
    WHERE (l.driver_id=? OR l.helper_driver_id=?)
      AND l.delivery_at >= '2026-10-20' AND l.delivery_at < '2026-11-10'
    ORDER BY l.delivery_at`,
  [donald.driverId, donald.driverId]
);
console.log("Donald loads Oct20-Nov10", dLoads);
const [d2200] = await pool.query(
  `SELECT l.id,l.gp_load,l.driver_id,l.helper_driver_id,l.delivery_at,lf.linehaul_rate,l.miles
     FROM loads l LEFT JOIN load_financials lf ON lf.load_id=l.id
    WHERE lf.linehaul_rate BETWEEN 2199 AND 2201
      AND l.delivery_at >= '2026-10-20' AND l.delivery_at < '2026-11-10'
    ORDER BY l.delivery_at`
);
console.log("any ~2200 LH loads", d2200);

// Singh relay vs OR fuel
console.log("\nSingh live fuel", singh && { fuel: singh.fuel, id: singh.driverId });
const [rf] = await pool.query(
  `SELECT * FROM relay_fuel_week_totals WHERE driver_id=? AND year=2026 AND week IN (44,45,46)`,
  [singh.driverId]
);
console.log("Singh relay weeks", rf);

// Try pay statements for these drivers
for (const d of [donald, day, malisa, singh]) {
  if (!d) continue;
  try {
    const j = await fetchOpenRoadJson(
      `${BASE}/driver_pay_statements?driver_id=${d.driverId}&sort=-period_start&per_page=10`
    );
    const rows = j?.data ?? [];
    console.log(`\npay stmts ${d.name} n=${rows.length}`, JSON.stringify(rows[0] ?? null, null, 2).slice(0, 1200));
  } catch (e) {
    console.log(`pay stmts ${d.name} FAIL`, e.message.slice(0, 160));
  }
}

await pool.end();
process.exit(0);
