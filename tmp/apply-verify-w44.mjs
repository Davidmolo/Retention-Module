import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
import mysql from "mysql2/promise";
const { syncOpenRoadFuelForWeek } = await import(
  "../lib/openroad/fuelCardTransactions.ts"
);
const { storeWeeklySummary } = await import("../lib/sources/weeklySummary.ts");

console.log("fuel sync", await syncOpenRoadFuelForWeek(2026, 44));
console.log("store", await storeWeeklySummary(2026, 44));

const p = await mysql.createConnection(process.env.DATABASE_URL);
const targets = [
  ["Kristopher Solano Elias", { gross: 8318 }],
  ["Gerald Kalyesubula", { gross: 9191.51 }],
  ["Maxwell Evariste", { gross: 9495 }],
  ["Jeffery Roberson", { ppg: 5.61, gross: 3201.54 }],
  ["Johnny Stewart", { ppg: 5.87 }],
  ["Jonathan Minor", { gross: 4455 }],
  ["Morgan Mcgrew", { gross: 6343.36 }],
  ["Joseph Wimmer", { gross: 8869.83 }],
  ["Robert Moreland", { mi: 2246.61, gross: 5700, pay: 2416.82 }],
];
const [rows] = await p.query(
  `SELECT driver_name, mileage, gross_income, drivers_pay, fuel_ppg
     FROM gross_profit_reports WHERE year=2026 AND week=44`
);
for (const [name, t] of targets) {
  const r = rows.find((x) => String(x.driver_name) === name);
  if (!r) {
    console.log(name, "MISSING");
    continue;
  }
  const gp = {
    mi: Number(r.mileage),
    gross: Number(r.gross_income),
    pay: Number(r.drivers_pay),
    ppg: Number(r.fuel_ppg),
  };
  const d = {};
  if (t.gross != null) d.gross = Math.round((gp.gross - t.gross) * 100) / 100;
  if (t.ppg != null) d.ppg = Math.round((gp.ppg - t.ppg) * 10000) / 10000;
  if (t.mi != null) d.mi = Math.round((gp.mi - t.mi) * 100) / 100;
  if (t.pay != null) d.pay = Math.round((gp.pay - t.pay) * 100) / 100;
  console.log(name, { gp, ss: t, delta: d });
}
const [fuel] = await p.query(
  `SELECT driver_id, diesel_gallons, diesel_net, txn_count FROM openroad_fuel_week_totals
    WHERE year=2026 AND week=44 AND driver_id IN (37886, 39297)`
);
console.log("fuel totals", fuel);
await p.end();
