import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
import { getPool } from "../lib/db.ts";
import { weekRange } from "../lib/week.ts";
import {
  isOwnerOperator,
  OWNER_OPERATOR_EXCEPTION_NAMES,
} from "../lib/sources/driverTypeGroups.ts";

const pool = getPool();
const year = 2026;
const weeks = [43, 44, 45, 46];

function isOoRow(name, type) {
  return isOwnerOperator({ driverType: type, name });
}

const allCases = [];

for (const week of weeks) {
  const { start, end } = weekRange(year, week);

  // Malisa-style: OO is helper (not load.driver_id) on team load, route in week by created
  const [helpers] = await pool.query(
    `SELECT dr.driver_id,
            TRIM(CONCAT_WS(' ', d.first_name, d.middle_name, d.last_name)) AS name,
            d.driver_type,
            l.id AS load_id,
            l.gp_load,
            l.driver_id AS primary_id,
            l.helper_driver_id,
            l.driver_count,
            l.miles AS load_miles,
            lf.linehaul_rate AS lf_lh,
            dr.loaded_miles,
            dr.empty_miles,
            dr.revenue AS route_rev,
            DATE(l.delivery_at) AS delivery,
            DATE(COALESCE(dr.source_created_at, dr.source_updated_at)) AS route_day
       FROM driver_routes dr
       JOIN loads l ON l.id = dr.load_id
       JOIN drivers d ON d.id = dr.driver_id
       LEFT JOIN load_financials lf ON lf.load_id = l.id
      WHERE dr.driver_id IS NOT NULL
        AND l.driver_id IS NOT NULL
        AND l.driver_id <> dr.driver_id
        AND COALESCE(l.driver_count, 0) >= 2
        AND DATE(COALESCE(dr.source_created_at, dr.source_updated_at)) BETWEEN ? AND ?
        AND dr.id = (
          SELECT dr2.id FROM driver_routes dr2
           WHERE dr2.load_id = dr.load_id AND dr2.driver_id = dr.driver_id
           ORDER BY COALESCE(dr2.source_created_at, dr2.source_updated_at) DESC, dr2.id DESC
           LIMIT 1
        )`,
    [start, end]
  );

  for (const r of helpers) {
    if (!isOoRow(r.name, r.driver_type)) continue;
    const lf = Number(r.lf_lh) || 0;
    const loaded = Number(r.loaded_miles) || 0;
    const loadMi = Number(r.load_miles) || 0;
    const routeRev = Number(r.route_rev) || 0;
    const share =
      loadMi > 0 ? Math.round(((lf * loaded) / loadMi) * 100) / 100 : 0;
    const floored = Math.floor((routeRev || share) / 100) * 100;
    allCases.push({
      kind: "OO_HELPER", // Malisa-style
      week,
      name: r.name,
      type: r.driver_type,
      gp_load: r.gp_load,
      lf_lh: lf,
      route_rev: routeRev,
      share,
      floored,
      delivery: r.delivery,
      route_day: r.route_day,
    });
  }

  // Day-style: OO is primary on team load, final route revenue << load LH
  const [primaries] = await pool.query(
    `SELECT dr.driver_id,
            TRIM(CONCAT_WS(' ', d.first_name, d.middle_name, d.last_name)) AS name,
            d.driver_type,
            l.id AS load_id,
            l.gp_load,
            l.miles AS load_miles,
            lf.linehaul_rate AS lf_lh,
            dr.loaded_miles,
            dr.revenue AS route_rev,
            DATE(l.delivery_at) AS delivery
       FROM driver_routes dr
       JOIN loads l ON l.id = dr.load_id
       JOIN drivers d ON d.id = dr.driver_id
       LEFT JOIN load_financials lf ON lf.load_id = l.id
      WHERE dr.driver_id IS NOT NULL
        AND l.driver_id = dr.driver_id
        AND COALESCE(l.driver_count, 0) >= 2
        AND DATE(l.delivery_at) BETWEEN ? AND ?
        AND LOWER(TRIM(COALESCE(l.status, ''))) <> 'canceled'
        AND dr.id = (
          SELECT dr2.id FROM driver_routes dr2
           WHERE dr2.load_id = dr.load_id AND dr2.driver_id = dr.driver_id
           ORDER BY COALESCE(dr2.source_created_at, dr2.source_updated_at) DESC, dr2.id DESC
           LIMIT 1
        )`,
    [start, end]
  );

  for (const r of primaries) {
    if (!isOoRow(r.name, r.driver_type)) continue;
    const lf = Number(r.lf_lh) || 0;
    const routeRev = Number(r.route_rev) || 0;
    if (lf <= 0) continue;
    // Day-like: route share much smaller than load LH (settlement often differs)
    const ratio = routeRev / lf;
    if (routeRev > 0 && routeRev < lf * 0.5) {
      allCases.push({
        kind: "OO_PRIMARY_PARTIAL", // Day-style small leg vs full load LH
        week,
        name: r.name,
        type: r.driver_type,
        gp_load: r.gp_load,
        lf_lh: lf,
        route_rev: routeRev,
        gap_vs_full_lf: Math.round((lf - routeRev) * 100) / 100,
        delivery: r.delivery,
      });
    } else if (routeRev === 0 && lf > 0) {
      allCases.push({
        kind: "OO_PRIMARY_ZERO_REV",
        week,
        name: r.name,
        type: r.driver_type,
        gp_load: r.gp_load,
        lf_lh: lf,
        route_rev: routeRev,
        delivery: r.delivery,
      });
    }
  }
}

const helpers = allCases.filter((c) => c.kind === "OO_HELPER");
const partials = allCases.filter((c) => c.kind === "OO_PRIMARY_PARTIAL");
const zeroRev = allCases.filter((c) => c.kind === "OO_PRIMARY_ZERO_REV");

console.log("\n=== COUNTS W43–W46 ===");
console.log({
  OO_HELPER_Malisa_style: helpers.length,
  OO_PRIMARY_PARTIAL_Day_style: partials.length,
  OO_PRIMARY_ZERO_REV: zeroRev.length,
  total_flagged: allCases.length,
});

console.log("\n=== By week ===");
for (const week of weeks) {
  const h = helpers.filter((c) => c.week === week).length;
  const p = partials.filter((c) => c.week === week).length;
  const z = zeroRev.filter((c) => c.week === week).length;
  console.log(`W${week}: helpers=${h} partial_primary=${p} zero_rev_primary=${z}`);
}

console.log("\n=== Unique drivers ===");
console.log(
  "helpers:",
  [...new Set(helpers.map((c) => c.name))].sort()
);
console.log(
  "partial primary:",
  [...new Set(partials.map((c) => c.name))].sort()
);

console.log("\n=== Helper detail ===");
for (const c of helpers) {
  console.log(
    JSON.stringify({
      week: c.week,
      name: c.name,
      load: c.gp_load,
      lf: c.lf_lh,
      route_rev: c.route_rev,
      floored: c.floored,
      delivery: c.delivery,
      route_day: c.route_day,
    })
  );
}

console.log("\n=== Partial primary detail (route_rev < 50% of load LH) ===");
for (const c of partials) {
  console.log(
    JSON.stringify({
      week: c.week,
      name: c.name,
      load: c.gp_load,
      lf: c.lf_lh,
      route_rev: c.route_rev,
      gap: c.gap_vs_full_lf,
    })
  );
}

await pool.end();
process.exit(0);
