import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
import mysql from "mysql2/promise";
import { weekRange } from "../lib/week.ts";

const { start, end } = weekRange(2026, 44);
const p = await mysql.createConnection(process.env.DATABASE_URL);

// Team loads that caused half-gross
const TEAM_LOADS = [2355803, 2364823, 2373295]; // elias, kalye, evariste
for (const lid of TEAM_LOADS) {
  const [l] = await p.query(
    `SELECT l.id, l.gp_load, l.driver_id, l.helper_driver_id, l.driver_count,
            l.linehaul_rate, l.revenue, lf.linehaul_rate lf_lh, lf.detention_sum
       FROM loads l LEFT JOIN load_financials lf ON lf.load_id=l.id WHERE l.id=?`,
    [lid]
  );
  const [routes] = await p.query(
    `SELECT driver_id, loaded_miles, empty_miles,
            DATE(COALESCE(source_created_at, source_updated_at)) rd
       FROM driver_routes WHERE load_id=?`,
    [lid]
  );
  const [helpers] = await p.query(
    `SELECT id, first_name, last_name FROM drivers WHERE id IN (?)`,
    [
      [
        l[0].driver_id,
        l[0].helper_driver_id,
        ...routes.map((r) => r.driver_id),
      ].filter(Boolean),
    ]
  );
  console.log("\nTEAM LOAD", l[0], "routes", routes, "drivers", helpers);
}

// Fuel raw txns for Roberson + Stewart — compare to SS
async function fuelDetail(nameLike, expectGal) {
  const [g] = await p.query(
    `SELECT driver_id, driver_name FROM gross_profit_reports
      WHERE year=2026 AND week=44 AND driver_name LIKE ?`,
    [nameLike]
  );
  const id = g[0]?.driver_id;
  console.log("\nFUEL", g[0]);
  const [orf] = await p.query(
    `SELECT * FROM openroad_fuel_week_totals WHERE year=2026 AND week=44 AND driver_id=?`,
    [id]
  );
  console.log("week total", orf[0]);
  // raw txn table?
  const [tables] = await p.query("SHOW TABLES LIKE '%fuel%'");
  console.log(
    "fuel tables",
    tables.map((t) => Object.values(t)[0])
  );
}

await fuelDetail("%Roberson%", 75.6);
await fuelDetail("%Stewart%", 457.14);

// Moreland / Mcgrew / Wimmer
for (const name of [
  "Robert Moreland",
  "Morgan Mcgrew",
  "Joseph Wimmer",
]) {
  const [gp] = await p.query(
    `SELECT driver_id, mileage, gross_income, drivers_pay, fuel_ppg
       FROM gross_profit_reports WHERE year=2026 AND week=44 AND driver_name=?`,
    [name]
  );
  const id = gp[0].driver_id;
  console.log("\n##", name, gp[0]);
  const [loads] = await p.query(
    `SELECT l.id, l.gp_load, l.status, l.driver_count, l.helper_driver_id,
            DATE(l.delivery_at) del,
            COALESCE(lf.linehaul_rate, l.linehaul_rate, l.revenue, 0) lh,
            COALESCE(lf.detention_sum, 0) det,
            (SELECT SUM(amount) FROM driver_accessorials da
              WHERE da.load_id=l.id AND LOWER(COALESCE(category,'')) LIKE '%detention%') det_paid
       FROM loads l
       LEFT JOIN load_financials lf ON lf.load_id=l.id
      WHERE l.driver_id=? AND DATE(l.delivery_at) BETWEEN ? AND ?
      ORDER BY l.delivery_at`,
    [id, start, end]
  );
  let sum = 0;
  for (const l of loads) {
    const net = Math.max(0, Number(l.det) - Number(l.det_paid || 0));
    const c =
      Number(l.driver_count) >= 2
        ? (Number(l.lh) + net) / Number(l.driver_count)
        : Number(l.lh) + net;
    sum += c;
    console.log({
      load: l.gp_load,
      del: String(l.del).slice(0, 15),
      dc: l.driver_count,
      helper: l.helper_driver_id,
      lh: Number(l.lh),
      det: Number(l.det),
      contrib: Math.round(c * 100) / 100,
    });
  }
  console.log("owned sum", Math.round(sum * 100) / 100);

  // helper shares
  const [helpers] = await p.query(
    `SELECT l.gp_load, l.driver_count,
            COALESCE(lf.linehaul_rate,l.linehaul_rate,l.revenue,0) lh,
            DATE(COALESCE(dr.source_created_at,dr.source_updated_at)) rd
       FROM driver_routes dr
       JOIN loads l ON l.id=dr.load_id
       LEFT JOIN load_financials lf ON lf.load_id=l.id
      WHERE dr.driver_id=? AND l.driver_id<>dr.driver_id
        AND COALESCE(l.driver_count,0)>=2
        AND DATE(COALESCE(dr.source_created_at,dr.source_updated_at)) BETWEEN ? AND ?`,
    [id, start, end]
  );
  if (helpers.length) console.log("as helper", helpers);

  const [acc] = await p.query(
    `SELECT category, amount, load_id FROM driver_accessorials
      WHERE driver_id=? AND settlement_week_start=? AND settlement_week_end=?`,
    [id, start, end]
  );
  if (acc.length) console.log("acc", acc);

  // miles from routes — column names
  const [rc] = await p.query("SHOW COLUMNS FROM driver_routes");
  const rcols = rc.map((c) => c.Field);
  console.log("route cols sample", rcols.filter((c) => /final|mile|load|driver|source/i.test(c)));
}

// Minor detention detail
const [minDet] = await p.query(
  `SELECT lf.* FROM load_financials lf
    JOIN loads l ON l.id=lf.load_id
   WHERE l.gp_load IN ('2610-00806','2610-00543')`
);
console.log("\nMinor load_financials", minDet);

// Roberson/Stewart: raw openroad fuel if stored per txn
const [ft] = await p.query("SHOW TABLES LIKE '%fuel_card%'");
console.log("fuel_card tables", ft);
if (ft.length) {
  const tname = Object.values(ft[0])[0];
  const [fc] = await p.query(`SHOW COLUMNS FROM \`${tname}\``);
  console.log(tname, fc.map((c) => c.Field).join(", "));
}

await p.end();
