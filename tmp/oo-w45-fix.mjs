import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
import { getPool } from "../lib/db.ts";
import { weekRange } from "../lib/week.ts";
import { getWeeklySummary } from "../lib/sources/weeklySummary.ts";

const pool = getPool();
const { start, end } = weekRange(2026, 45);
const summary = await getWeeklySummary(2026, 45);

const donald = summary.drivers.find((d) => /^donald\s+smith$/i.test(d.name.trim()));
console.log("Donald live", donald && {
  id: donald.driverId, mi: donald.mileage, lh: donald.grossIncome,
  fuel: donald.fuel, fuelG: donald.fuelGross, fuelD: donald.fuelDiscounted,
});

if (donald) {
  const [loads] = await pool.query(
    `SELECT l.id, l.gp_load, l.status, l.driver_count, l.miles, l.empty_miles,
            l.delivery_at, lf.linehaul_rate AS lf_lh
       FROM loads l LEFT JOIN load_financials lf ON lf.load_id=l.id
      WHERE l.driver_id=? AND DATE(l.delivery_at) BETWEEN ? AND ?
      ORDER BY l.delivery_at`,
    [donald.driverId, start, end]
  );
  console.log("Donald W45 loads", loads);
  const [orf] = await pool.query(
    `SELECT * FROM openroad_fuel_week_totals WHERE driver_id=? AND year=2026 AND week=45`,
    [donald.driverId]
  );
  const [rf] = await pool.query(
    `SELECT * FROM relay_fuel_week_totals WHERE driver_id=? AND year=2026 AND week=45`,
    [donald.driverId]
  );
  console.log("Donald fuel", { or: orf[0] ?? null, relay: rf[0] ?? null });
}

// Malisa missing SS load 2610-01127
const [m] = await pool.query(
  `SELECT l.*, lf.linehaul_rate AS lf_lh FROM loads l
   LEFT JOIN load_financials lf ON lf.load_id=l.id
   WHERE l.gp_load LIKE '%01127%' OR l.gp_load='2610-01127'`
);
console.log("load 01127", m);

// Cheryl team load 01088 routes all drivers
const [c] = await pool.query(
  `SELECT dr.driver_id, dr.loaded_miles, dr.empty_miles, dr.revenue,
          l.gp_load, l.driver_id AS primary_id, l.helper_driver_id, lf.linehaul_rate
     FROM driver_routes dr
     JOIN loads l ON l.id=dr.load_id
     LEFT JOIN load_financials lf ON lf.load_id=l.id
    WHERE l.gp_load='2610-01088'`
);
console.log("Cheryl team 01088 routes", c);

// Singh gallons for 0.12 fee — OR fuel txns in W45 vs settlement window
const singh = summary.drivers.find((d) => /manpreet/i.test(d.name));
if (singh) {
  const [tx] = await pool.query(
    `SELECT date, diesel_gallons, diesel_amount, discount, total, net_pg
       FROM openroad_fuel_transactions
      WHERE driver_id=? AND date BETWEEN '2026-10-27' AND '2026-11-08'
      ORDER BY date`,
    [singh.driverId]
  ).catch(async () => {
    const [t2] = await pool.query(
      `SHOW TABLES LIKE '%fuel%'`
    );
    console.log("fuel tables", t2);
    return [[]];
  });
  console.log("Singh OR fuel rows", tx);
  console.log("Singh 449.664*0.12", 449.664 * 0.12, "605.83*0.12", 605.833 * 0.12);
}

await pool.end();
process.exit(0);
