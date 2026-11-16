import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
import { getPool } from "../lib/db.ts";
import { isOwnerOperator } from "../lib/sources/driverTypeGroups.ts";
import { getWeeklySummary } from "../lib/sources/weeklySummary.ts";

const pool = getPool();
const year = 2026;
const week = 44;

const [stored] = await pool.query(
  `SELECT driver_name, driver_type, mileage, gross_income, fuel, gross_profit
     FROM gross_profit_reports WHERE year=? AND week=?`,
  [year, week]
);
const storedOo = stored.filter((r) =>
  isOwnerOperator({ driverType: r.driver_type, name: r.driver_name })
);
const zeroGi = storedOo.filter(
  (r) => Number(r.gross_income) === 0 && Number(r.mileage) > 50
);
console.log(`W${week} stored OO=${storedOo.length} miles-but-gi0=${zeroGi.length}`);
for (const r of zeroGi) {
  console.log(" still bad", r.driver_name, r);
}

const live = await getWeeklySummary(year, week);
const liveOo = live.drivers.filter((d) =>
  isOwnerOperator({ driverType: d.driverType, name: d.name })
);
const liveMap = new Map(liveOo.map((d) => [d.name.toLowerCase(), d]));
let deltas = 0;
for (const s of storedOo) {
  const L = liveMap.get(String(s.driver_name).toLowerCase());
  if (!L) continue;
  const sGi = Number(s.gross_income) || 0;
  const sGp = Number(s.gross_profit) || 0;
  if (Math.abs(sGi - L.grossIncome) > 1 || Math.abs(sGp - L.grossProfit) > 1) {
    deltas++;
    console.log(
      `DELTA ${s.driver_name}: stored gi=${sGi} gp=${sGp} | live gi=${L.grossIncome} gp=${L.grossProfit}`
    );
  }
}
console.log(`W${week} stored vs live OO deltas: ${deltas}`);

const cheryl = storedOo.find((r) =>
  String(r.driver_name).toLowerCase().includes("cheryl")
);
console.log("Cheryl stored", cheryl);

await pool.end();
process.exit(0);
