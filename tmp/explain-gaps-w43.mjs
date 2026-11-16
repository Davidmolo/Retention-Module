import fs from 'fs';
import nextEnv from '@next/env';
import mysql from 'mysql2/promise';

nextEnv.loadEnvConfig(process.cwd());

const START = '2026-10-13';
const END = '2026-10-19';
const { mismatches } = JSON.parse(
  fs.readFileSync('tmp/gp-compare.json', 'utf8')
);
const live = JSON.parse(
  fs.readFileSync('tmp/live-reconcile-w43.json', 'utf8')
);

const FOCUS = [
  24215, 39423, 39073, 22054, 38499, 37886, 40131, 39422, 35669, 37820,
  18754, 40249, 38802,
];

const pool = await mysql.createConnection(process.env.DATABASE_URL);

function sheetFromCompare(id) {
  const m = mismatches.find((x) => x.week === 43 && x.id === id);
  if (!m) return { match: true };
  const out = { match: false, diffs: m.diffs, name: m.dbName };
  for (const d of m.diffs) {
    out[d.field] = { sheet: d.sheet, db: d.db, delta: d.delta };
  }
  // Also need sheet values for fields that matched — pull from live sheet if present
  return out;
}

const report = [];

for (const id of FOCUS) {
  const L = live.results.find((r) => r.id === id);
  const cmp = mismatches.find((x) => x.week === 43 && x.id === id);

  // DB loads for driver as primary
  const [loads] = await pool.query(
    `SELECT l.id, l.driver_id, l.helper_driver_id, l.driver_count,
            l.miles, l.empty_miles,
            COALESCE(lf.linehaul_rate, l.linehaul_rate, l.revenue, 0) AS linehaul,
            COALESCE(lf.detention_sum, 0) AS detention_sum,
            COALESCE(det.paid, 0) AS det_paid
       FROM loads l
       LEFT JOIN load_financials lf ON lf.load_id = l.id
       LEFT JOIN (
         SELECT load_id, driver_id, SUM(amount) paid
           FROM driver_accessorials
          WHERE LOWER(COALESCE(category,'')) LIKE '%detention%'
          GROUP BY load_id, driver_id
       ) det ON det.load_id = l.id AND det.driver_id = l.driver_id
      WHERE DATE(l.delivery_at) BETWEEN ? AND ?
        AND LOWER(TRIM(COALESCE(l.status,''))) <> 'canceled'
        AND (l.driver_id = ? OR l.helper_driver_id = ?)
      ORDER BY l.id`,
    [START, END, id, id]
  );

  const [routes] = await pool.query(
    `SELECT dr.load_id,
            COALESCE(dr.loaded_miles,0)+COALESCE(dr.empty_miles,0) AS mi,
            dr.revenue,
            l.driver_count, l.driver_id, l.helper_driver_id,
            COALESCE(lf.linehaul_rate, l.linehaul_rate, 0) AS linehaul,
            COALESCE(lf.detention_sum,0) AS detention_sum
       FROM driver_routes dr
       JOIN loads l ON l.id = dr.load_id
       LEFT JOIN load_financials lf ON lf.load_id = l.id
      WHERE dr.driver_id = ?
        AND DATE(l.delivery_at) BETWEEN ? AND ?
        AND LOWER(TRIM(COALESCE(l.status,''))) <> 'canceled'
        AND dr.id = (
          SELECT dr2.id FROM driver_routes dr2
           WHERE dr2.load_id = dr.load_id AND dr2.driver_id = dr.driver_id
           ORDER BY COALESCE(dr2.source_updated_at, dr2.source_created_at) DESC, dr2.id DESC
           LIMIT 1
        )
      ORDER BY dr.load_id`,
    [id, START, END]
  );

  const [acc] = await pool.query(
    `SELECT category, SUM(amount) amt, COUNT(*) n
       FROM driver_accessorials
      WHERE driver_id = ?
        AND settlement_week_start = ? AND settlement_week_end = ?
      GROUP BY category`,
    [id, START, END]
  );

  // Manual GP-like rebuild
  let gross = 0;
  let miles = 0;
  const parts = [];
  for (const l of loads) {
    const count = Number(l.driver_count || 0);
    if (count >= 2) continue;
    if (Number(l.driver_id) !== id) continue; // helper on solo? skip full
    const keep = Math.max(0, Number(l.detention_sum) - Number(l.det_paid));
    const g = Number(l.linehaul) + keep;
    const mi = Number(l.miles || 0) + Number(l.empty_miles || 0);
    gross += g;
    miles += mi;
    parts.push({
      kind: 'solo',
      load: l.id,
      mi,
      linehaul: Number(l.linehaul),
      det: Number(l.detention_sum),
      detPaid: Number(l.det_paid),
      keep,
      g,
    });
  }
  for (const r of routes) {
    const count = Number(r.driver_count || 0);
    if (count < 2) {
      // orphan solo only if load.driver_id is null or not this driver handled above
      const primary = loads.find((l) => Number(l.id) === Number(r.load_id));
      if (primary && Number(primary.driver_id) === id && Number(primary.driver_count || 0) < 2)
        continue;
      if (primary && Number(primary.driver_count || 0) >= 2) continue;
    }
    if (count < 2) {
      // helper/orphan route
      const mi = Number(r.mi);
      const g = Number(r.revenue || 0);
      gross += g;
      miles += mi;
      parts.push({ kind: 'orphan_route', load: r.load_id, mi, g });
      continue;
    }
    const mi = Number(r.mi);
    const g = Number(r.revenue || 0);
    gross += g;
    miles += mi;
    parts.push({
      kind: 'share',
      load: r.load_id,
      mi,
      g,
      linehaul: Number(r.linehaul),
      count,
    });
  }

  report.push({
    id,
    name: L?.name,
    sheetVsGp: cmp
      ? Object.fromEntries(
          cmp.diffs
            .filter((d) =>
              ['mileage', 'gross', 'pay', 'ppg'].includes(d.field)
            )
            .map((d) => [d.field, d])
        )
      : 'FULL_MATCH_OR_ABSENT',
    gp: L?.gp,
    fuelLivePpg: L?.live?.fuel?.ppg,
    rebuild: {
      miles: Math.round(miles * 100) / 100,
      gross: Math.round(gross * 100) / 100,
      vsGpMi: L?.gp ? Math.round((miles - L.gp.mi) * 100) / 100 : null,
      vsGpGross: L?.gp ? Math.round((gross - L.gp.gross) * 100) / 100 : null,
    },
    parts,
    acc,
    liveDetOnLoads: (L?.liveLoadDetails || [])
      .filter((x) => x.detention)
      .map((x) => ({ id: x.id, det: x.detention, lh: x.linehaul })),
  });
}

await pool.end();
fs.writeFileSync('tmp/explain-gaps-w43.json', JSON.stringify(report, null, 2));

for (const r of report) {
  const core = r.sheetVsGp;
  const gaps =
    core === 'FULL_MATCH_OR_ABSENT'
      ? 'MATCH'
      : Object.entries(core)
          .map(
            ([f, d]) =>
              `${f}: sheet ${d.sheet} gp ${d.db} Δ${d.delta}`
          )
          .join(' | ');
  console.log(
    `\n${r.name}: ${gaps}\n  rebuild mi ${r.rebuild.miles} (Δgp ${r.rebuild.vsGpMi}) gross ${r.rebuild.gross} (Δgp ${r.rebuild.vsGpGross}) fuelPpg ${r.fuelLivePpg}\n  parts: ${r.parts.map((p) => `${p.kind}#${p.load} g=${p.g} mi=${p.mi}${p.det ? ` det=${p.det}/${p.keep}` : ''}`).join('; ')}\n  acc: ${JSON.stringify(r.acc)}`
  );
}
