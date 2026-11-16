import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
import { getPool } from "../lib/db.ts";
import { isOwnerOperator, ooFuelMode } from "../lib/sources/driverTypeGroups.ts";
import { getWeeklySummary } from "../lib/sources/weeklySummary.ts";

const pool = getPool();
const year = 2026;
const week = 45;

const [stored] = await pool.query(
  `SELECT driver_name, driver_type, mileage, gross_income, fuel, fuel_gross, fuel_discounted, gross_profit, total_expenses, linehaul_pct
     FROM gross_profit_reports WHERE year=? AND week=? ORDER BY driver_name`,
  [year, week]
);
const storedOo = stored.filter((r) =>
  isOwnerOperator({ driverType: r.driver_type, name: r.driver_name })
);

console.log("=== STORED vs expected issue: gross_income=0 ===");
const zeroGi = storedOo.filter(
  (r) => Number(r.gross_income) === 0 && Number(r.mileage) > 50
);
console.log(
  `W${week} stored OO with miles but gross 0: ${zeroGi.length}/${storedOo.length}`
);

const live = await getWeeklySummary(year, week);
const liveOo = live.drivers.filter((d) =>
  isOwnerOperator({ driverType: d.driverType, name: d.name })
);

console.log("\n=== Live fuel=0 with miles (non-zero mode) ===");
for (const d of liveOo) {
  const mode = ooFuelMode(d.name);
  if (d.mileage > 100 && Math.abs(d.fuel) < 0.01 && mode !== "zero") {
    // pull OR fuel week for driver
    const [fuel] = await pool.query(
      `SELECT SUM(gallons) g, SUM(amount) amt, SUM(amount_retail) retail, COUNT(*) n
         FROM fuel_transactions
        WHERE driver_id = ?
          AND transaction_date >= '2026-10-27' AND transaction_date <= '2026-11-02'`,
      [d.driverId]
    );
    const [orWeek] = await pool.query(
      `SELECT * FROM openroad_fuel_week_totals WHERE driver_id=? AND year=? AND week=?`,
      [d.driverId, year, week]
    );
    const [relay] = await pool.query(
      `SELECT * FROM relay_fuel_week_totals WHERE driver_id=? AND year=? AND week=?`,
      [d.driverId, year, week]
    );
    console.log(
      JSON.stringify({
        name: d.name,
        id: d.driverId,
        mode,
        miles: d.mileage,
        gross: d.grossIncome,
        fuel: d.fuel,
        fuelTx: fuel[0],
        orWeek: orWeek[0] ?? null,
        relay: relay[0] ?? null,
      })
    );
  }
}

console.log("\n=== Idle OO (0 miles) still on report ===");
for (const d of liveOo.filter((x) => x.mileage === 0)) {
  console.log(
    `${d.name} type=${d.driverType} status=? gp=${d.grossProfit} exp=${d.totalExpenses} fuel=${d.fuel}`
  );
}

console.log("\n=== Stored vs Live GP delta (OO) ===");
const liveMap = new Map(liveOo.map((d) => [d.name.toLowerCase(), d]));
for (const s of storedOo) {
  const L = liveMap.get(String(s.driver_name).toLowerCase());
  if (!L) {
    console.log(`STORED ONLY ${s.driver_name}`);
    continue;
  }
  const sGi = Number(s.gross_income) || 0;
  const sGp = Number(s.gross_profit) || 0;
  if (Math.abs(sGi - L.grossIncome) > 1 || Math.abs(sGp - L.grossProfit) > 1) {
    console.log(
      `${s.driver_name}: stored gi=${sGi} gp=${sGp} | live gi=${L.grossIncome} gp=${L.grossProfit} Δgp=${(L.grossProfit - sGp).toFixed(2)}`
    );
  }
}

await pool.end();
