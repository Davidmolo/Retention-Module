import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
import mysql from "mysql2/promise";

const TARGETS = [
  {
    key: "elias",
    name: "Kristopher Solano Elias",
    issue: "total gross in",
    ss: { gross: 8318.0, note: "OR W44 linehaul 3900+1100+3318" },
  },
  {
    key: "kalyesubula",
    name: "Gerald Kalyesubula",
    issue: "total gross in",
    ss: { gross: 9191.51, note: "OR W44 linehaul total" },
  },
  {
    key: "evariste",
    name: "Maxwell Evariste",
    issue: "total gross in",
    ss: { gross: 9495.0, note: "OR W44 linehaul total" },
  },
  {
    key: "roberson",
    name: "Jeffery Roberson",
    issue: "fuel net p/g",
    ss: { ppg: 5.61, note: "OR fuel Net P/G (1 txn 75.6gal / $423.98)" },
  },
  {
    key: "stewart",
    name: "Stewart",
    issue: "fuel net p/g",
    ss: { ppg: 5.87, note: "OR fuel Net P/G 457.14gal / $2924.15" },
  },
  {
    key: "minor",
    name: "Jonathan Minor",
    issue: "total gross in",
    ss: {
      gross_linehaul: 4400.0,
      gross_with_detention: 4455.0,
      note: "OR linehaul $4400; Mantas: with detention should be $4455; GP has $1000 too much",
    },
  },
  {
    key: "moreland",
    name: "Robert Moreland",
    issue: "miles, total gross in, drivers pay",
    ss: {
      mi: 2246.61,
      gross: 5700.0,
      pay: 2416.82,
      note: "OR settlement: mi 2246.61, revenue 5700, earnings 2416.82 (incl $150 Acc)",
    },
  },
  {
    key: "mcgrew",
    name: "Morgan Mcgrew",
    issue: "total gross in",
    ss: { gross: null, note: "listed by Mantas; no SS in this batch" },
  },
  {
    key: "wimmer",
    name: "Joseph Wimmer",
    issue: "total gross in",
    ss: { gross: 8869.83, note: "OR W44 linehaul total" },
  },
];

const p = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await p.query(
  `SELECT driver_id, driver_name, mileage, gross_income, drivers_pay, fuel_ppg, fuel_mpg, prepass, trips
     FROM gross_profit_reports
    WHERE year=2026 AND week=44
    ORDER BY driver_name`
);
await p.end();

function find(key, full) {
  const k = key.toLowerCase();
  const f = (full || "").toLowerCase();
  return (
    rows.find((r) => String(r.driver_name).toLowerCase() === f) ||
    rows.find((r) => String(r.driver_name).toLowerCase().includes(k))
  );
}

const out = [];
for (const t of TARGETS) {
  const r = find(t.key, t.name);
  if (!r) {
    out.push({ ...t, gp: null, deltas: { missing: "db" } });
    continue;
  }
  const gp = {
    name: r.driver_name,
    mi: Number(r.mileage),
    gross: Number(r.gross_income),
    pay: Number(r.drivers_pay),
    ppg: Number(r.fuel_ppg),
    mpg: Number(r.fuel_mpg),
    prepass: Number(r.prepass),
  };
  const d = {};
  if (t.ss.gross != null) d.gross = Math.round((gp.gross - t.ss.gross) * 100) / 100;
  if (t.ss.ppg != null) d.ppg = Math.round((gp.ppg - t.ss.ppg) * 10000) / 10000;
  if (t.ss.mi != null) d.mi = Math.round((gp.mi - t.ss.mi) * 100) / 100;
  if (t.ss.pay != null) d.pay = Math.round((gp.pay - t.ss.pay) * 100) / 100;
  if (t.ss.gross_linehaul != null)
    d.gross_vs_linehaul =
      Math.round((gp.gross - t.ss.gross_linehaul) * 100) / 100;
  if (t.ss.gross_with_detention != null)
    d.gross_vs_with_det =
      Math.round((gp.gross - t.ss.gross_with_detention) * 100) / 100;
  out.push({ key: t.key, issue: t.issue, ss: t.ss, gp, deltas: d });
}

console.log(JSON.stringify(out, null, 2));
