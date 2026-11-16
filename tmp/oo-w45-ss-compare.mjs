import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
import { getPool } from "../lib/db.ts";
import { weekRange } from "../lib/week.ts";
import { getWeeklySummary } from "../lib/sources/weeklySummary.ts";

const pool = getPool();
const year = 2026;
const week = 45;
const { start, end } = weekRange(year, week);
console.log("W45", start, end);

const targets = [
  { match: /donald|smith/i, label: "D.Smith", ss: { mi: 2897, lh: 7133.13, fuel: 1568.17 } },
  { match: /cheryl|day/i, label: "Day", ss: { mi: 2463.3, lh: 8242.71 } },
  { match: /malisa/i, label: "Malisa", ss: { mi: 2802.6, lh: 8910 } },
  { match: /manpreet|singh/i, label: "Singh", ss: { fee: 72.7 } },
  { match: /prospere/i, label: "Prospere", ss: { mi: 1628.4, lh: 4600 } },
];

const summary = await getWeeklySummary(year, week);

for (const t of targets) {
  const d = summary.drivers.find((x) => t.match.test(x.name));
  if (!d) {
    console.log("\nMISSING", t.label);
    continue;
  }
  console.log(`\n=== ${t.label} ${d.name} id=${d.driverId} ===`);
  console.log({
    our: { mi: d.mileage, lh: d.grossIncome, fuel: d.fuel, fuelG: d.fuelGross, fuelD: d.fuelDiscounted },
    ss: t.ss,
  });

  const [loads] = await pool.query(
    `SELECT l.id, l.gp_load, l.status, l.driver_id, l.driver_count, l.helper_driver_id,
            l.miles, l.empty_miles, l.linehaul_rate, l.revenue, l.delivery_at,
            lf.linehaul_rate AS lf_lh
       FROM loads l
       LEFT JOIN load_financials lf ON lf.load_id = l.id
      WHERE (l.driver_id = ? OR l.helper_driver_id = ?)
        AND DATE(l.delivery_at) BETWEEN ? AND ?
      ORDER BY l.delivery_at`,
    [d.driverId, d.driverId, start, end]
  );
  console.log("loads by delivery week", loads);

  const [routes] = await pool.query(
    `SELECT dr.load_id, l.gp_load, dr.loaded_miles, dr.empty_miles, dr.revenue,
            l.driver_id AS primary_id, l.delivery_at, lf.linehaul_rate AS lf_lh
       FROM driver_routes dr
       JOIN loads l ON l.id = dr.load_id
       LEFT JOIN load_financials lf ON lf.load_id = l.id
      WHERE dr.driver_id = ?
        AND DATE(l.delivery_at) BETWEEN ? AND ?
      ORDER BY l.delivery_at`,
    [d.driverId, start, end]
  );
  console.log("routes", routes);

  const [orf] = await pool.query(
    `SELECT * FROM openroad_fuel_week_totals WHERE driver_id=? AND year=? AND week=?`,
    [d.driverId, year, week]
  );
  const [rf] = await pool.query(
    `SELECT * FROM relay_fuel_week_totals WHERE driver_id=? AND year=? AND week=?`,
    [d.driverId, year, week]
  );
  console.log("fuel weeks", { or: orf[0] ?? null, relay: rf[0] ?? null });
}

await pool.end();
process.exit(0);
