import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
import mysql from "mysql2/promise";
const { syncOpenRoadFuelForWeek } = await import(
  "../lib/openroad/fuelCardTransactions.ts"
);
const { storeWeeklySummary } = await import("../lib/sources/weeklySummary.ts");

const r = await syncOpenRoadFuelForWeek(2026, 44);
console.log("sync", r);

const p = await mysql.createConnection(process.env.DATABASE_URL);
const [beforeStore] = await p.query(
  `SELECT driver_id, diesel_gallons, diesel_net, txn_count
     FROM openroad_fuel_week_totals
    WHERE year=2026 AND week=44 AND driver_id IN (37886, 39297)`
);
for (const x of beforeStore) {
  const gal = Number(x.diesel_gallons);
  const net = Number(x.diesel_net);
  console.log("stored fuel", x.driver_id, {
    gal,
    net,
    txns: x.txn_count,
    ppg: gal ? Math.round((net / gal) * 10000) / 10000 : null,
  });
}
await p.end();

// Also check: how many of Roberson's matched txns came via unit/card vs driver_id
// by re-fetching resolve path counts — already know live API has 1 with driver_id.
// If after sync still 5, unit/card fallback is the bug.

console.log("rebuilding W44 summary for PPG...");
const stored = await storeWeeklySummary(2026, 44);
console.log("stored drivers", stored.drivers);

const p2 = await mysql.createConnection(process.env.DATABASE_URL);
const [gp] = await p2.query(
  `SELECT driver_name, fuel_ppg, gross_income, mileage
     FROM gross_profit_reports
    WHERE year=2026 AND week=44
      AND (driver_name LIKE '%Roberson%' OR driver_name LIKE '%Stewart%')`
);
console.log("GP after rebuild", gp);
await p2.end();
