import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
import mysql from "mysql2/promise";
import { weekRange } from "../lib/week.ts";

const { start, end } = weekRange(2026, 44);
console.log("W44", start, "→", end);

const FOCUS = [
  { key: "elias", like: "%Elias%", expectGross: 8318 },
  { key: "kalyesubula", like: "%Kalye%", expectGross: 9191.51 },
  { key: "evariste", like: "%Evariste%", expectGross: 9495 },
  { key: "roberson", like: "%Roberson%", expectPpg: 5.61 },
  { key: "stewart", like: "%Stewart%", expectPpg: 5.87 },
  { key: "minor", like: "%Minor%", expectGross: 4455 },
  { key: "moreland", like: "%Moreland%", expectMi: 2246.61, expectGross: 5700, expectPay: 2416.82 },
  { key: "mcgrew", like: "%Mcgrew%", expectGross: 6343.36 },
  { key: "wimmer", like: "%Wimmer%", expectGross: 8869.83 },
];

const p = await mysql.createConnection(process.env.DATABASE_URL);

for (const f of FOCUS) {
  const [drv] = await p.query(
    `SELECT id, first_name, last_name FROM drivers
      WHERE CONCAT(COALESCE(first_name,''),' ',COALESCE(last_name,'')) LIKE ?
         OR last_name LIKE ?
      LIMIT 5`,
    [f.like, f.like]
  );
  let driver = drv[0];
  if (!driver) {
    console.log("\n##", f.key, "NO DRIVER");
    continue;
  }
  const id = driver.id;
  console.log("\n##", f.key, id, driver.first_name, driver.last_name);

  const [gp] = await p.query(
    `SELECT mileage, gross_income, drivers_pay, fuel_ppg, fuel, fuel_mpg
       FROM gross_profit_reports WHERE year=2026 AND week=44 AND driver_id=?`,
    [id]
  );
  console.log("GP", gp[0]);

  // Loads delivered in week (primary ownership)
  const [loads] = await p.query(
    `SELECT l.id, l.number, l.status, l.driver_id, l.driver_count,
            DATE(l.pickup_at) pu, DATE(l.delivery_at) del,
            l.linehaul_rate, l.revenue, l.total,
            lf.linehaul_rate lf_lh, lf.detention_sum, lf.total lf_total,
            (SELECT SUM(amount) FROM driver_accessorials da
              WHERE da.load_id=l.id AND LOWER(COALESCE(category,'')) LIKE '%detention%') det_paid
       FROM loads l
       LEFT JOIN load_financials lf ON lf.load_id=l.id
      WHERE l.driver_id=?
        AND DATE(l.delivery_at) BETWEEN ? AND ?
      ORDER BY l.delivery_at`,
    [id, start, end]
  );
  console.log("OWNED loads del-in-week", loads.length);
  for (const l of loads) {
    const lh = Number(l.lf_lh ?? l.linehaul_rate ?? l.revenue ?? 0);
    const det = Math.max(0, Number(l.detention_sum || 0) - Number(l.det_paid || 0));
    const share =
      Number(l.driver_count || 0) >= 2
        ? (lh + det) / Math.max(Number(l.driver_count), 1)
        : lh + det;
    console.log({
      id: l.id,
      num: l.number,
      status: l.status,
      dc: l.driver_count,
      pu: l.pu,
      del: l.del,
      lh,
      det_sum: Number(l.detention_sum || 0),
      det_paid: Number(l.det_paid || 0),
      net_det: det,
      contrib: Math.round(share * 100) / 100,
    });
  }
  const ownedGross = loads.reduce((s, l) => {
    const lh = Number(l.lf_lh ?? l.linehaul_rate ?? l.revenue ?? 0);
    const det = Math.max(0, Number(l.detention_sum || 0) - Number(l.det_paid || 0));
    const share =
      Number(l.driver_count || 0) >= 2
        ? (lh + det) / Math.max(Number(l.driver_count), 1)
        : lh + det;
    return s + share;
  }, 0);
  console.log("ownedGross sum", Math.round(ownedGross * 100) / 100);

  // Helper team loads (route week)
  const [helpers] = await p.query(
    `SELECT l.id, l.number, l.driver_id owner, l.driver_count,
            DATE(l.delivery_at) del,
            DATE(COALESCE(dr.source_created_at, dr.source_updated_at)) route_day,
            lf.linehaul_rate lf_lh, l.linehaul_rate, l.revenue,
            lf.detention_sum,
            (SELECT SUM(amount) FROM driver_accessorials da
              WHERE da.load_id=l.id AND LOWER(COALESCE(category,'')) LIKE '%detention%') det_paid
       FROM driver_routes dr
       JOIN loads l ON l.id=dr.load_id
       LEFT JOIN load_financials lf ON lf.load_id=l.id
      WHERE dr.driver_id=?
        AND l.driver_id IS NOT NULL AND l.driver_id<>dr.driver_id
        AND COALESCE(l.driver_count,0)>=2
        AND DATE(COALESCE(dr.source_created_at, dr.source_updated_at)) BETWEEN ? AND ?
      ORDER BY route_day`,
    [id, start, end]
  );
  if (helpers.length) {
    console.log("HELPER team routes", helpers.length);
    for (const l of helpers) {
      const lh = Number(l.lf_lh ?? l.linehaul_rate ?? l.revenue ?? 0);
      const det = Math.max(0, Number(l.detention_sum || 0) - Number(l.det_paid || 0));
      const share = (lh + det) / Math.max(Number(l.driver_count), 1);
      console.log({
        id: l.id,
        num: l.number,
        owner: l.owner,
        dc: l.driver_count,
        route_day: l.route_day,
        del: l.del,
        contrib: Math.round(share * 100) / 100,
      });
    }
  }

  // All loads that touch driver via routes in week (for miles)
  const [routes] = await p.query(
    `SELECT dr.load_id, l.number, l.driver_id owner, DATE(l.delivery_at) del,
            DATE(COALESCE(dr.source_created_at, dr.source_updated_at)) route_day,
            dr.loaded_miles, dr.empty_miles, dr.is_final,
            COALESCE(dr.loaded_miles,0)+COALESCE(dr.empty_miles,0) mi
       FROM driver_routes dr
       JOIN loads l ON l.id=dr.load_id
      WHERE dr.driver_id=?
        AND (
          (l.driver_id=dr.driver_id AND DATE(l.delivery_at) BETWEEN ? AND ?)
          OR (l.driver_id<>dr.driver_id AND DATE(COALESCE(dr.source_created_at, dr.source_updated_at)) BETWEEN ? AND ?)
          OR (l.driver_id IS NULL AND DATE(COALESCE(dr.source_created_at, dr.source_updated_at)) BETWEEN ? AND ?)
        )
      ORDER BY route_day, dr.load_id`,
    [id, start, end, start, end, start, end]
  );
  const finalMi = routes
    .filter((r) => r.is_final == null || r.is_final === 1 || r.is_final === true)
    .reduce((s, r) => s + Number(r.mi || 0), 0);
  console.log(
    "routes",
    routes.length,
    "finalMi",
    Math.round(finalMi * 100) / 100,
    "sample",
    routes.slice(0, 8).map((r) => ({
      load: r.load_id,
      num: r.number,
      owner: r.owner,
      del: r.del,
      rd: r.route_day,
      mi: Number(r.mi),
      final: r.is_final,
    }))
  );

  // Fuel sources
  const [orFuel] = await p.query(
    `SELECT diesel_gallons, diesel_net, net_ppg, txn_count
       FROM openroad_fuel_week_totals
      WHERE year=2026 AND week=44 AND driver_id=?`,
    [id]
  ).catch(() => [[]]);
  const [relay] = await p.query(
    `SELECT gallons, amount_paid, product_code
       FROM relay_fuel_transactions
      WHERE driver_id=? AND DATE(transaction_at) BETWEEN ? AND ?`,
    [id, start, end]
  ).catch(() => [[]]);
  console.log("OR fuel week", orFuel[0] || null);
  if (relay?.length) {
    const diesel = relay.filter((t) =>
      /diesel|ulfsd|ulsd/i.test(String(t.product_code || ""))
    );
    const gal = diesel.reduce((s, t) => s + Number(t.gallons || 0), 0);
    const amt = diesel.reduce((s, t) => s + Number(t.amount_paid || 0), 0);
    console.log("Relay diesel", {
      n: diesel.length,
      gal: Math.round(gal * 1000) / 1000,
      amt: Math.round(amt * 100) / 100,
      ppg: gal ? Math.round((amt / gal) * 10000) / 10000 : null,
    });
  }

  // Accessorials settlement week
  const [acc] = await p.query(
    `SELECT category, amount, load_id, settlement_week_start, settlement_week_end
       FROM driver_accessorials
      WHERE driver_id=? AND settlement_week_start=? AND settlement_week_end=?`,
    [id, start, end]
  );
  if (acc.length) console.log("accessorials", acc);

  if (f.expectGross != null && gp[0]) {
    console.log(
      "GROSS expect",
      f.expectGross,
      "gp",
      Number(gp[0].gross_income),
      "Δ",
      Math.round((Number(gp[0].gross_income) - f.expectGross) * 100) / 100
    );
  }
}

await p.end();
