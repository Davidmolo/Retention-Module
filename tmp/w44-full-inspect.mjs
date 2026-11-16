import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
import mysql from "mysql2/promise";
import { weekRange } from "../lib/week.ts";

const { start, end } = weekRange(2026, 44);
const p = await mysql.createConnection(process.env.DATABASE_URL);

const out = { week: "W44", range: { start, end }, findings: [] };

function add(title, data) {
  out.findings.push({ title, ...data });
  console.log("\n===", title, "===");
  console.log(JSON.stringify(data, null, 2));
}

// ---------- helpers ----------
async function gp(name) {
  const [r] = await p.query(
    `SELECT * FROM gross_profit_reports WHERE year=2026 AND week=44 AND driver_name=?`,
    [name]
  );
  return r[0] || null;
}

async function ownedLoads(driverId) {
  const [rows] = await p.query(
    `SELECT l.id, l.gp_load, l.status, l.driver_id, l.helper_driver_id, l.driver_count,
            DATE(l.pickup_at) pu, DATE(l.delivery_at) del,
            l.linehaul_rate l_lh, l.revenue, l.miles, l.empty_miles,
            lf.linehaul_rate lf_lh, lf.detention_sum, lf.fuel_surcharge, lf.lumper_sum,
            lf.misc_sum, lf.total lf_total, lf.status lf_status,
            (SELECT SUM(amount) FROM driver_accessorials da
              WHERE da.load_id=l.id AND LOWER(COALESCE(category,'')) LIKE '%detention%') det_acc,
            (SELECT SUM(amount) FROM driver_accessorials da WHERE da.load_id=l.id) all_acc
       FROM loads l
       LEFT JOIN load_financials lf ON lf.load_id=l.id
      WHERE l.driver_id=? AND DATE(l.delivery_at) BETWEEN ? AND ?
      ORDER BY l.delivery_at`,
    [driverId, start, end]
  );
  return rows.map((l) => {
    const lh = Number(l.lf_lh ?? l.l_lh ?? l.revenue ?? 0);
    const det = Math.max(0, Number(l.detention_sum || 0) - Number(l.det_acc || 0));
    const dc = Number(l.driver_count || 0);
    const canceled = String(l.status || "").toLowerCase() === "canceled";
    const full = canceled ? 0 : lh + det;
    const split = canceled ? 0 : dc >= 2 ? full / Math.max(dc, 1) : full;
    return {
      id: l.id,
      gp_load: l.gp_load,
      status: l.status,
      helper: l.helper_driver_id,
      dc,
      pu: String(l.pu).slice(0, 10),
      del: String(l.del).slice(0, 10),
      lf_lh: Number(l.lf_lh || 0),
      l_lh: Number(l.l_lh || 0),
      revenue: Number(l.revenue || 0),
      det_sum: Number(l.detention_sum || 0),
      det_acc: Number(l.det_acc || 0),
      net_det: det,
      lumper: Number(l.lumper_sum || 0),
      fs: Number(l.fuel_surcharge || 0),
      lf_total: Number(l.lf_total || 0),
      contrib_full: Math.round(full * 100) / 100,
      contrib_split: Math.round(split * 100) / 100,
    };
  });
}

async function helperName(id) {
  if (!id) return null;
  const [r] = await p.query(
    `SELECT id, first_name, last_name, status FROM drivers WHERE id=?`,
    [id]
  );
  return r[0]
    ? {
        id: r[0].id,
        name: `${r[0].first_name} ${r[0].last_name}`,
        status: r[0].status,
      }
    : { id };
}

async function helperShares(driverId) {
  const [rows] = await p.query(
    `SELECT l.id, l.gp_load, l.driver_id owner, l.helper_driver_id, l.driver_count,
            DATE(l.delivery_at) del,
            DATE(COALESCE(dr.source_created_at, dr.source_updated_at)) rd,
            COALESCE(lf.linehaul_rate, l.linehaul_rate, l.revenue, 0) lh,
            COALESCE(lf.detention_sum, 0) det
       FROM driver_routes dr
       JOIN loads l ON l.id=dr.load_id
       LEFT JOIN load_financials lf ON lf.load_id=l.id
      WHERE dr.driver_id=?
        AND l.driver_id IS NOT NULL AND l.driver_id <> dr.driver_id
        AND COALESCE(l.driver_count,0) >= 2
        AND DATE(COALESCE(dr.source_created_at, dr.source_updated_at)) BETWEEN ? AND ?`,
    [driverId, start, end]
  );
  // dedupe by load
  const seen = new Set();
  const outRows = [];
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    const share =
      (Number(r.lh) + Number(r.det)) / Math.max(Number(r.driver_count), 1);
    outRows.push({
      gp_load: r.gp_load,
      owner: r.owner,
      dc: r.driver_count,
      lh: Number(r.lh),
      share: Math.round(share * 100) / 100,
      rd: String(r.rd).slice(0, 10),
      del: String(r.del).slice(0, 10),
    });
  }
  return outRows;
}

async function routeMiles(driverId) {
  const [rows] = await p.query(
    `SELECT dr.load_id, l.gp_load, l.driver_id owner, l.driver_count,
            DATE(l.delivery_at) del,
            DATE(COALESCE(dr.source_created_at, dr.source_updated_at)) rd,
            COALESCE(dr.loaded_miles,0) lm, COALESCE(dr.empty_miles,0) em
       FROM driver_routes dr
       JOIN loads l ON l.id=dr.load_id
      WHERE dr.driver_id=?`,
    [driverId]
  );
  const inWeek = [];
  for (const r of rows) {
    const owned = Number(r.owner) === Number(driverId);
    const del = String(r.del).slice(0, 10);
    const rd = String(r.rd).slice(0, 10);
    const ok = owned
      ? del >= start && del <= end
      : rd >= start && rd <= end;
    if (!ok) continue;
    inWeek.push({
      gp_load: r.gp_load,
      owned,
      owner: r.owner,
      dc: r.driver_count,
      del,
      rd,
      mi: Math.round((Number(r.lm) + Number(r.em)) * 100) / 100,
      lm: Number(r.lm),
      em: Number(r.em),
    });
  }
  const total = inWeek.reduce((s, r) => s + r.mi, 0);
  return { total: Math.round(total * 100) / 100, rows: inWeek };
}

async function fuelProbe(driverId, name) {
  const [orf] = await p.query(
    `SELECT * FROM openroad_fuel_week_totals WHERE year=2026 AND week=44 AND driver_id=?`,
    [driverId]
  );
  const or = orf[0] || null;
  const orPpg =
    or && Number(or.diesel_gallons) > 0
      ? Number(or.diesel_net) / Number(or.diesel_gallons)
      : null;

  // fuel_transactions (.dat) in week
  let dat = null;
  try {
    const [ft] = await p.query(
      `SELECT COUNT(*) n, SUM(gallons) gal, SUM(amount) amt,
              COUNT(DISTINCT card_number) cards
         FROM fuel_transactions
        WHERE driver_id=? AND DATE(transaction_at) BETWEEN ? AND ?`,
      [driverId, start, end]
    );
    dat = ft[0];
  } catch (e) {
    dat = { err: e.message };
  }

  // relay week totals
  let relay = null;
  try {
    const [rf] = await p.query(
      `SELECT * FROM relay_fuel_week_totals WHERE year=2026 AND week=44 AND driver_id=?`,
      [driverId]
    );
    relay = rf[0] || null;
  } catch (e) {
    relay = { err: e.message };
  }

  // assignment trucks this week
  const [asg] = await p.query(
    `SELECT a.driver_id, tr.unit, DATE(a.start_date) s, DATE(a.end_date) e
       FROM assignments a JOIN trucks tr ON tr.id=a.truck_id
      WHERE a.driver_id=?
        AND DATE(a.start_date) <= ?
        AND (a.end_date IS NULL OR DATE(a.end_date) >= ?)`,
    [driverId, end, start]
  );

  // other drivers on same units overlapping week
  const units = asg.map((a) => a.unit).filter(Boolean);
  let unitMates = [];
  if (units.length) {
    const [mates] = await p.query(
      `SELECT a.driver_id, d.first_name, d.last_name, tr.unit,
              DATE(a.start_date) s, DATE(a.end_date) e
         FROM assignments a
         JOIN trucks tr ON tr.id=a.truck_id
         JOIN drivers d ON d.id=a.driver_id
        WHERE tr.unit IN (?)
          AND a.driver_id <> ?
          AND DATE(a.start_date) <= ?
          AND (a.end_date IS NULL OR DATE(a.end_date) >= ?)`,
      [units, driverId, end, start]
    );
    unitMates = mates;
  }

  return {
    name,
    orFuel: or
      ? {
          gal: Number(or.diesel_gallons),
          amt: Number(or.diesel_amount),
          disc: Number(or.discount),
          net: Number(or.diesel_net),
          txns: Number(or.txn_count),
          ppg: orPpg ? Math.round(orPpg * 10000) / 10000 : null,
        }
      : null,
    dat,
    relay,
    units: asg,
    unitMates,
  };
}

// ---------- cases ----------
const CASES = [
  {
    name: "Kristopher Solano Elias",
    orGross: 8318,
    orLoads: [
      { load: "2610-00478", lh: 3900 },
      { load: "2610-00792", lh: 1100 },
      { load: "2610-00865", lh: 3318 },
    ],
  },
  {
    name: "Gerald Kalyesubula",
    orGross: 9191.51,
    orLoads: [
      { load: "2610-00716", lh: 900 },
      { load: "2610-00738", lh: 1100 },
      { load: "2610-00659", lh: 1300 },
      { load: "2610-00800", lh: 3257.52 },
      { load: "2610-00809", lh: 2633.99 },
    ],
  },
  {
    name: "Maxwell Evariste",
    orGross: 9495,
    orLoads: [
      { load: "2610-00695", lh: 1000 },
      { load: "2610-00734", lh: 1600 },
      { load: "2610-00758", lh: 1995 },
      { load: "2610-00818", lh: 1900 },
      { load: "2610-00828", lh: 3000 },
    ],
  },
  {
    name: "Jeffery Roberson",
    orGross: 3201.54,
    orPpg: 5.61,
    orFuelGal: 75.6,
    orFuelNet: 423.98,
  },
  {
    name: "Johnny Stewart",
    orPpg: 5.87,
    orFuelGal: 457.14,
    orFuelNet: 2924.15,
  },
  {
    name: "Jonathan Minor",
    orGrossLinehaul: 4400,
    orGrossWithDet: 4455,
  },
  {
    name: "Robert Moreland",
    orMi: 2246.61,
    orGross: 5700,
    orPay: 2416.82,
  },
  {
    name: "Morgan Mcgrew",
    orGross: 6343.36,
    orLoads: [
      { load: "2610-00750", lh: 2200 },
      { load: "2610-00871", lh: 1500 },
      { load: "2610-00492", lh: 2001.04 },
      { load: "2610-00834", lh: 642.32 },
    ],
  },
  {
    name: "Joseph Wimmer",
    orGross: 8869.83,
    orLoads: [
      { load: "2610-00674", lh: 1600 },
      { load: "2610-00707", lh: 1061.36 },
      { load: "2610-00764", lh: 558.47 },
      { load: "2610-00575", lh: 850 },
      { load: "2610-00804", lh: 2000 },
      { load: "2610-00873", lh: 2800 },
    ],
  },
];

for (const c of CASES) {
  const g = await gp(c.name);
  if (!g) {
    add(c.name, { error: "no GP row" });
    continue;
  }
  const id = g.driver_id;
  const loads = await ownedLoads(id);
  const helpers = await helperShares(id);
  const miles = await routeMiles(id);
  const fuel = await fuelProbe(id, c.name);

  const helpersInfo = [];
  for (const l of loads.filter((x) => x.dc >= 2)) {
    helpersInfo.push({
      load: l.gp_load,
      dc: l.dc,
      helper: await helperName(l.helper),
      lf_lh: l.lf_lh,
      or_lh: c.orLoads?.find((o) => o.load === l.gp_load)?.lh ?? null,
      full: l.contrib_full,
      split: l.contrib_split,
    });
  }

  const sumFull = loads.reduce((s, l) => s + l.contrib_full, 0);
  const sumSplit = loads.reduce((s, l) => s + l.contrib_split, 0);
  const helperSum = helpers.reduce((s, h) => s + h.share, 0);
  const gpGross = Number(g.gross_income);
  const gpMi = Number(g.mileage);
  const gpPay = Number(g.drivers_pay);
  const gpPpg = Number(g.fuel_ppg);

  // per-load OR compare
  const loadDiffs = (c.orLoads || []).map((o) => {
    const ours = loads.find((l) => l.gp_load === o.load);
    return {
      load: o.load,
      or_lh: o.lh,
      our_lf_lh: ours?.lf_lh ?? null,
      our_dc: ours?.dc ?? null,
      our_full: ours?.contrib_full ?? null,
      our_split: ours?.contrib_split ?? null,
      lh_delta: ours ? Math.round((ours.lf_lh - o.lh) * 100) / 100 : "MISSING",
    };
  });

  const causes = [];
  if (c.orGross != null) {
    const dSplit = Math.round((gpGross - c.orGross) * 100) / 100;
    const dFull = Math.round((sumFull + helperSum - c.orGross) * 100) / 100;
    if (Math.abs(dSplit) > 1) {
      const teamGap = Math.round((sumFull - sumSplit) * 100) / 100;
      if (teamGap > 1) causes.push(`team_1n_removed_$${teamGap}`);
      const lhMismatch = loadDiffs.filter(
        (d) => typeof d.lh_delta === "number" && Math.abs(d.lh_delta) > 1
      );
      if (lhMismatch.length)
        causes.push(
          `linehaul_source_mismatch:${lhMismatch
            .map((d) => `${d.load} OR$${d.or_lh}/DB$${d.our_lf_lh}`)
            .join(",")}`
        );
      if (Math.abs(dFull) <= 1)
        causes.push("full_primary_no_split_would_match_OR");
      else if (Math.abs(dFull) > 1)
        causes.push(`even_full_still_off_Δ$${dFull}`);
    } else causes.push("gross_matches_OR");
  }
  if (c.orGrossWithDet != null) {
    const d = Math.round((gpGross - c.orGrossWithDet) * 100) / 100;
    const detAdded = loads.reduce((s, l) => s + l.net_det, 0);
    if (Math.abs(d) > 1) {
      causes.push(`gross_vs_OR_with_det_Δ$${d}`);
      causes.push(`net_detention_added_$${detAdded}`);
      for (const l of loads.filter((x) => x.net_det > 0)) {
        causes.push(
          `det_on_${l.gp_load}:sum$${l.det_sum}-acc$${l.det_acc}=$${l.net_det} lumper$${l.lumper}`
        );
      }
    }
  }
  if (c.orPpg != null) {
    const d = Math.round((gpPpg - c.orPpg) * 10000) / 10000;
    if (Math.abs(d) > 0.02) {
      causes.push(`ppg_Δ$${d}`);
      if (fuel.orFuel && c.orFuelGal) {
        causes.push(
          `fuel_gal_OR_UI$${c.orFuelGal}_vs_sync$${fuel.orFuel.gal}_txns$${fuel.orFuel.txns}`
        );
        if (fuel.unitMates.length)
          causes.push(
            `shared_unit_mates:${fuel.unitMates
              .map((m) => `${m.first_name} ${m.last_name}@${m.unit}`)
              .join("|")}`
          );
      }
    } else causes.push("ppg_matches");
  }
  if (c.orMi != null) {
    const d = Math.round((gpMi - c.orMi) * 100) / 100;
    if (Math.abs(d) > 2) causes.push(`miles_Δ${d}_routeTotal$${miles.total}`);
  }
  if (c.orPay != null) {
    const d = Math.round((gpPay - c.orPay) * 100) / 100;
    if (Math.abs(d) > 1) causes.push(`pay_Δ$${d}`);
  }

  // Moreland: search 2818 loads
  let moreland2818 = null;
  if (c.name.includes("Moreland")) {
    const [m2818] = await p.query(
      `SELECT id, gp_load, driver_id, DATE(delivery_at) del, linehaul_rate, revenue, driver_count
         FROM loads WHERE gp_load LIKE '2818%' AND driver_id=? LIMIT 20`,
      [id]
    );
    const [any2818] = await p.query(
      `SELECT COUNT(*) n FROM loads WHERE gp_load LIKE '2818%'`
    );
    const [acc] = await p.query(
      `SELECT category, amount, load_id FROM driver_accessorials
        WHERE driver_id=? AND settlement_week_start=? AND settlement_week_end=?`,
      [id, start, end]
    );
    moreland2818 = {
      loadsForDriver: m2818,
      total2818InDb: Number(any2818[0].n),
      accessorials: acc,
      note:
        Number(any2818[0].n) === 0
          ? "No 2818-* loads in DB at all — screenshot is a different OpenRoad statement/entity than our 2610 company loads"
          : "2818 loads exist but may not be linked",
    };
  }

  add(c.name, {
    gp: { mi: gpMi, gross: gpGross, pay: gpPay, ppg: gpPpg },
    or: {
      gross: c.orGross ?? c.orGrossWithDet ?? null,
      ppg: c.orPpg ?? null,
      mi: c.orMi ?? null,
      pay: c.orPay ?? null,
    },
    sums: {
      owned_full: Math.round(sumFull * 100) / 100,
      owned_split: Math.round(sumSplit * 100) / 100,
      helper_share: Math.round(helperSum * 100) / 100,
      full_plus_helper: Math.round((sumFull + helperSum) * 100) / 100,
      split_plus_helper: Math.round((sumSplit + helperSum) * 100) / 100,
    },
    teamLoads: helpersInfo,
    loadDiffs,
    helpers,
    miles,
    fuel,
    moreland2818,
    causes,
  });
}

// Global: how many W44 loads are team-split affecting active drivers
const [teamStats] = await p.query(
  `SELECT COUNT(*) n,
          SUM(CASE WHEN helper_driver_id IS NOT NULL THEN 1 ELSE 0 END) with_helper
     FROM loads
    WHERE DATE(delivery_at) BETWEEN ? AND ?
      AND COALESCE(driver_count,0) >= 2`,
  [start, end]
);
add("W44 team load population", { stats: teamStats[0] });

// Jurevicius status
const [jur] = await p.query(
  `SELECT id, first_name, last_name, status FROM drivers WHERE last_name LIKE '%Jurevicius%'`
);
add("Jurevicius status", { drivers: jur });

import fs from "fs";
fs.writeFileSync("tmp/w44-full-inspect.json", JSON.stringify(out, null, 2));
console.log("\nWrote tmp/w44-full-inspect.json findings:", out.findings.length);
await p.end();
