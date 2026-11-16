import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
import mysql from "mysql2/promise";
import { weekRange } from "../lib/week.ts";

const { start, end } = weekRange(2026, 44);
const p = await mysql.createConnection(process.env.DATABASE_URL);

const [cols] = await p.query("SHOW COLUMNS FROM loads");
console.log(
  "loads cols:",
  cols.map((c) => c.Field).join(", ")
);

const [orc] = await p.query("SHOW TABLES LIKE 'openroad_fuel%'");
console.log("or fuel tables", orc);

const NAMES = [
  ["elias", "Kristopher Solano Elias", 8318],
  ["kalyesubula", "Gerald Kalyesubula", 9191.51],
  ["evariste", "Maxwell Evariste", 9495],
  ["roberson", "Jeffery Roberson", null],
  ["stewart", "Johnny Stewart", null],
  ["minor", "Jonathan Minor", 4455],
  ["moreland", "Robert Moreland", 5700],
  ["mcgrew", "Morgan Mcgrew", 6343.36],
  ["wimmer", "Joseph Wimmer", 8869.83],
];

const [gpAll] = await p.query(
  `SELECT driver_id, driver_name, mileage, gross_income, drivers_pay, fuel_ppg
     FROM gross_profit_reports WHERE year=2026 AND week=44`
);

function findGp(name) {
  const n = name.toLowerCase();
  return gpAll.find((r) => String(r.driver_name).toLowerCase() === n);
}

// detect load number column
const loadFields = new Set(cols.map((c) => c.Field));
const numCol = loadFields.has("gp_load") ? "gp_load" : "id";
const statusCol = loadFields.has("status") ? "status" : null;

for (const [key, full, expectGross] of NAMES) {
  const gp = findGp(full);
  if (!gp) {
    console.log("\n##", key, "NO GP ROW for", full);
    continue;
  }
  const id = gp.driver_id;
  console.log("\n##", key, id, full);
  console.log("GP", {
    mi: Number(gp.mileage),
    gross: Number(gp.gross_income),
    pay: Number(gp.drivers_pay),
    ppg: Number(gp.fuel_ppg),
  });

  const [loads] = await p.query(
    `SELECT l.id, l.${numCol || "id"} AS num, ${statusCol ? "l.status," : ""}
            l.driver_id, l.driver_count,
            DATE(l.pickup_at) pu, DATE(l.delivery_at) del,
            l.linehaul_rate, l.revenue,
            lf.linehaul_rate lf_lh, lf.detention_sum, lf.total lf_total,
            (SELECT SUM(amount) FROM driver_accessorials da
              WHERE da.load_id=l.id
                AND LOWER(COALESCE(category,'')) LIKE '%detention%') det_paid
       FROM loads l
       LEFT JOIN load_financials lf ON lf.load_id=l.id
      WHERE l.driver_id=?
        AND DATE(l.delivery_at) BETWEEN ? AND ?
      ORDER BY l.delivery_at`,
    [id, start, end]
  );

  let owned = 0;
  for (const l of loads) {
    const canceled =
      String(l.status || "")
        .toLowerCase()
        .trim() === "canceled";
    const lh = Number(l.lf_lh ?? l.linehaul_rate ?? l.revenue ?? 0);
    const det = Math.max(
      0,
      Number(l.detention_sum || 0) - Number(l.det_paid || 0)
    );
    const dc = Number(l.driver_count || 0);
    const contrib = canceled
      ? 0
      : dc >= 2
        ? (lh + det) / Math.max(dc, 1)
        : lh + det;
    owned += contrib;
    console.log({
      id: l.id,
      num: l.num,
      status: l.status,
      dc,
      pu: String(l.pu),
      del: String(l.del),
      lh,
      det_sum: Number(l.detention_sum || 0),
      det_paid: Number(l.det_paid || 0),
      net_det: det,
      contrib: Math.round(contrib * 100) / 100,
      canceled,
    });
  }
  console.log(
    "ownedGross",
    Math.round(owned * 100) / 100,
    "expect",
    expectGross,
    "gp",
    Number(gp.gross_income),
    "Δgp",
    expectGross != null
      ? Math.round((Number(gp.gross_income) - expectGross) * 100) / 100
      : null
  );

  // Loads delivered nearby that might be week-edge
  const [near] = await p.query(
    `SELECT l.id, l.${numCol || "id"} AS num, l.status, l.driver_count,
            DATE(l.pickup_at) pu, DATE(l.delivery_at) del,
            COALESCE(lf.linehaul_rate, l.linehaul_rate, l.revenue, 0) lh,
            COALESCE(lf.detention_sum, 0) det_sum
       FROM loads l
       LEFT JOIN load_financials lf ON lf.load_id=l.id
      WHERE l.driver_id=?
        AND DATE(l.delivery_at) BETWEEN DATE_SUB(?, INTERVAL 3 DAY) AND DATE_ADD(?, INTERVAL 3 DAY)
      ORDER BY l.delivery_at`,
    [id, start, end]
  );
  if (near.length !== loads.length) {
    console.log(
      "near-week loads (±3d)",
      near.map((l) => ({
        id: l.id,
        num: l.num,
        del: String(l.del),
        lh: Number(l.lh),
        det: Number(l.det_sum),
        st: l.status,
        dc: l.driver_count,
      }))
    );
  }

  // Helper revenue
  const [helpers] = await p.query(
    `SELECT l.id, COALESCE(lf.linehaul_rate, l.linehaul_rate, l.revenue, 0) lh,
            COALESCE(lf.detention_sum, 0) det_sum, l.driver_count,
            DATE(COALESCE(dr.source_created_at, dr.source_updated_at)) route_day
       FROM driver_routes dr
       JOIN loads l ON l.id = dr.load_id
       LEFT JOIN load_financials lf ON lf.load_id = l.id
      WHERE dr.driver_id = ?
        AND l.driver_id IS NOT NULL AND l.driver_id <> dr.driver_id
        AND COALESCE(l.driver_count, 0) >= 2
        AND DATE(COALESCE(dr.source_created_at, dr.source_updated_at)) BETWEEN ? AND ?`,
    [id, start, end]
  );
  if (helpers.length) {
    console.log(
      "helpers",
      helpers.map((h) => ({
        id: h.id,
        lh: Number(h.lh),
        det: Number(h.det_sum),
        dc: h.driver_count,
        rd: String(h.route_day),
        share:
          Math.round(
            ((Number(h.lh) + Number(h.det_sum)) /
              Math.max(Number(h.driver_count), 1)) *
              100
          ) / 100,
      }))
    );
  }

  // Fuel
  try {
    const [orf] = await p.query(
      `SELECT * FROM openroad_fuel_week_totals WHERE year=2026 AND week=44 AND driver_id=?`,
      [id]
    );
    console.log("OR fuel totals", orf[0] || null);
  } catch (e) {
    console.log("OR fuel table err", e.message);
  }

  try {
    const [rf] = await p.query(
      `SELECT product_code, gallons, amount_paid, DATE(transaction_at) d
         FROM relay_fuel_transactions
        WHERE driver_id=? AND DATE(transaction_at) BETWEEN ? AND ?`,
      [id, start, end]
    );
    if (rf.length) {
      const diesel = rf.filter((t) =>
        /diesel|ulfsd|ulsd/i.test(String(t.product_code || ""))
      );
      const allGal = rf.reduce((s, t) => s + Number(t.gallons || 0), 0);
      const allAmt = rf.reduce((s, t) => s + Number(t.amount_paid || 0), 0);
      const dGal = diesel.reduce((s, t) => s + Number(t.gallons || 0), 0);
      const dAmt = diesel.reduce((s, t) => s + Number(t.amount_paid || 0), 0);
      console.log("Relay", {
        n: rf.length,
        allPpg: allGal ? allAmt / allGal : null,
        dieselN: diesel.length,
        dieselPpg: dGal ? dAmt / dGal : null,
        dGal,
        dAmt,
      });
    }
  } catch (e) {
    console.log("relay err", e.message);
  }

  // Accessorials
  const [acc] = await p.query(
    `SELECT category, amount, load_id FROM driver_accessorials
      WHERE driver_id=? AND settlement_week_start=? AND settlement_week_end=?`,
    [id, start, end]
  );
  if (acc.length) console.log("acc", acc);

  // Moreland miles detail
  if (key === "moreland" || key === "minor") {
    const [rts] = await p.query(
      `SELECT dr.load_id, l.driver_id owner, DATE(l.delivery_at) del,
              DATE(COALESCE(dr.source_created_at, dr.source_updated_at)) rd,
              COALESCE(dr.loaded_miles,0)+COALESCE(dr.empty_miles,0) mi,
              dr.is_final, COALESCE(lf.linehaul_rate,l.linehaul_rate,l.revenue,0) lh
         FROM driver_routes dr
         JOIN loads l ON l.id=dr.load_id
         LEFT JOIN load_financials lf ON lf.load_id=l.id
        WHERE dr.driver_id=?
        ORDER BY rd`,
      [id]
    );
    const inWeek = rts.filter((r) => {
      const del = String(r.del);
      const rd = String(r.rd);
      const owned = Number(r.owner) === Number(id);
      if (owned) return del >= start && del <= end;
      return rd >= start && rd <= end;
    });
    console.log(
      "route-in-week",
      inWeek.map((r) => ({
        load: r.load_id,
        owner: r.owner,
        del: String(r.del),
        rd: String(r.rd),
        mi: Number(r.mi),
        final: r.is_final,
        lh: Number(r.lh),
      }))
    );
  }
}

await p.end();
