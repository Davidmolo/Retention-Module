import fs from 'fs';
import nextEnv from '@next/env';
import XLSX from 'xlsx';
import mysql from 'mysql2/promise';

nextEnv.loadEnvConfig(process.cwd());
const { fetchOpenRoadJson } = await import('../lib/openroad/client.ts');

const YEAR = 2026;
const WEEK = 43;
const START = '2026-10-13';
const END = '2026-10-19';

const FOCUS = [
  { key: 'Chambers', id: 24215 },
  { key: 'Meighan', id: 39423 },
  { key: 'Mcgrew', id: 39073 },
  { key: 'Nedeljkovic', id: 22054 },
  { key: 'Evariste', id: 38499 },
  { key: 'Roberson', id: 37886 },
  { key: 'Crayton', id: 40131 },
  { key: 'Elias', id: 39422 },
  { key: 'Turner', id: 35669 },
  { key: 'Moreland', id: 37820 },
  { key: 'Brittain', id: 18754 },
  { key: 'Gilbert', id: 40249 },
  { key: 'Kincaid', id: 38802 },
];

function num(v) {
  if (v == null || v === '' || v === '-') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function money(v) {
  const n = num(v);
  return n == null ? null : Math.round(n * 100) / 100;
}
function r2(v) {
  return v == null || !Number.isFinite(Number(v))
    ? null
    : Math.round(Number(v) * 100) / 100;
}

function parseSheet(file) {
  const buf = fs.readFileSync(file);
  const wb = XLSX.read(buf, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    raw: true,
    defval: null,
  });
  const out = [];
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c += 5) {
      const name = row[c];
      if (typeof name !== 'string') continue;
      if (String(rows[r + 1]?.[c] || '').trim() !== 'RATE $') continue;
      const block = {};
      for (let k = 1; k <= 25 && r + k < rows.length; k++) {
        const lab = String(rows[r + k]?.[c] || '').trim();
        if (!lab) continue;
        block[lab] = {
          a: rows[r + k]?.[c + 1] ?? null,
          b: rows[r + k]?.[c + 2] ?? null,
          calc: rows[r + k]?.[c + 3] ?? null,
        };
      }
      out.push({
        name: name.trim(),
        sheetId: num(row[c + 1]),
        mileage: num(block['MILEAGE']?.a),
        gross: num(block['TOTAL GROSS INCOME']?.a),
        pay: num(block["Driver's pay"]?.a),
        mpg: num(block['Fuel']?.a),
        ppg: num(block['Fuel']?.b),
        prepass: num(block['PREPASS']?.a),
      });
    }
  }
  return out;
}

async function liveFinancial(loadId) {
  const json = await fetchOpenRoadJson(
    `https://app.openroadtms.com/api/ext/v1/load_financials/${loadId}`
  );
  return json?.data ?? json;
}

async function liveLoad(loadId) {
  const json = await fetchOpenRoadJson(
    `https://app.openroadtms.com/api/ext/v1/loads/${loadId}`
  );
  return json?.data ?? json;
}

const sheetCards = parseSheet('D:/azfs/grossProfit/tmp/W43.xlsx');
function sheetFor(key, id) {
  return (
    sheetCards.find((s) => s.sheetId === id) ||
    sheetCards.find((s) => s.name.toLowerCase().includes(key.toLowerCase()))
  );
}

const pool = await mysql.createConnection(process.env.DATABASE_URL);
const results = [];

for (const f of FOCUS) {
  console.log(`\n=== ${f.key} ${f.id} ===`);
  const [gpRows] = await pool.query(
    `SELECT driver_name, mileage, gross_income, drivers_pay, fuel_ppg, fuel_mpg,
            fuel, prepass, trips, compensation_name, linehaul_pct
       FROM gross_profit_reports
      WHERE year=? AND week=? AND driver_id=?`,
    [YEAR, WEEK, f.id]
  );
  const gp = gpRows[0] || null;
  const sheet = sheetFor(f.key, f.id);

  const [compRows] = await pool.query(
    `SELECT c.status, c.loaded_mile_rate, c.empty_mile_rate, c.linehaul_percentage, c.flat_rate, c.name
       FROM drivers d LEFT JOIN compensations c ON c.id = d.compensation_id
      WHERE d.id = ?`,
    [f.id]
  );
  const comp = compRows[0] || null;

  // Candidate load ids: delivery week as primary or helper, plus routes
  const [idRows] = await pool.query(
    `SELECT DISTINCT id FROM (
        SELECT id FROM loads
         WHERE DATE(delivery_at) BETWEEN ? AND ?
           AND LOWER(TRIM(COALESCE(status,''))) <> 'canceled'
           AND (driver_id = ? OR helper_driver_id = ?)
        UNION
        SELECT dr.load_id AS id
          FROM driver_routes dr
          JOIN loads l ON l.id = dr.load_id
         WHERE dr.driver_id = ?
           AND DATE(l.delivery_at) BETWEEN ? AND ?
           AND LOWER(TRIM(COALESCE(l.status,''))) <> 'canceled'
      ) x WHERE id IS NOT NULL`,
    [START, END, f.id, f.id, f.id, START, END]
  );
  const loadIds = idRows.map((r) => Number(r.id));

  const liveLoads = [];
  for (const lid of loadIds) {
    try {
      const [L, F] = await Promise.all([liveLoad(lid), liveFinancial(lid)]);
      const accessorials = Array.isArray(F?.driver_accessorials)
        ? F.driver_accessorials
        : Array.isArray(F?.accessorials)
          ? F.accessorials
          : [];
      // keep accessorials for this driver
      const mine = accessorials.filter(
        (a) => a.driver_id == null || Number(a.driver_id) === f.id
      );
      liveLoads.push({
        id: lid,
        status: L?.status,
        driver_id: L?.driver_id ?? null,
        helper_driver_id: L?.helper_driver_id ?? null,
        driver_count: L?.driver_count ?? null,
        miles: money(L?.miles),
        empty_miles: money(L?.empty_miles),
        delivery_at: L?.delivery_at ?? null,
        linehaul: money(F?.linehaul_rate ?? L?.linehaul_rate),
        detention_sum: money(F?.detention_sum),
        total: money(F?.total),
        accessorials: mine.map((a) => ({
          id: a.id,
          cat: a.category,
          amt: money(a.amount),
          note: a.note,
          settlement_status: a.settlement_status,
          week: `${a.settlement_week_start || ''}..${a.settlement_week_end || ''}`,
        })),
      });
    } catch (e) {
      liveLoads.push({ id: lid, error: e.message.slice(0, 160) });
    }
  }

  // Final routes from DB (already synced; used for multi-driver share)
  const [routes] = await pool.query(
    `SELECT dr.load_id, dr.loaded_miles, dr.empty_miles, dr.revenue,
            COALESCE(l.driver_count,0) AS driver_count,
            l.driver_id AS load_driver_id
       FROM driver_routes dr
       JOIN loads l ON l.id = dr.load_id
      WHERE dr.driver_id = ?
        AND DATE(l.delivery_at) BETWEEN ? AND ?
        AND LOWER(TRIM(COALESCE(l.status,''))) <> 'canceled'
        AND dr.id = (
          SELECT dr2.id FROM driver_routes dr2
           WHERE dr2.load_id = dr.load_id AND dr2.driver_id = dr.driver_id
           ORDER BY COALESCE(dr2.source_updated_at, dr2.source_created_at) DESC, dr2.id DESC
           LIMIT 1
        )`,
    [f.id, START, END]
  );

  // Settlement-week accessorials from DB (synced from OR)
  const [acc] = await pool.query(
    `SELECT category, amount, load_id, note, settlement_status,
            settlement_week_start, settlement_week_end
       FROM driver_accessorials
      WHERE driver_id = ?
        AND settlement_week_start = ?
        AND settlement_week_end = ?`,
    [f.id, START, END]
  );

  // Rebuild company gross from LIVE financials using GP rules
  let soloGross = 0;
  let soloMiles = 0;
  let detentionKept = 0;
  let detentionSum = 0;
  let detentionPaidOnLoad = 0;
  const soloLoadIds = new Set();

  for (const L of liveLoads) {
    if (L.error) continue;
    const count = Number(L.driver_count || 0);
    const isPrimary = Number(L.driver_id) === f.id;
    if (!(count < 2 && isPrimary)) continue;
    soloLoadIds.add(L.id);
    const detSum = Number(L.detention_sum || 0);
    const detPaid = L.accessorials
      .filter((a) => String(a.cat || '').toLowerCase().includes('detention'))
      .reduce((s, a) => s + Number(a.amt || 0), 0);
    const keep = Math.max(0, detSum - detPaid);
    const g = Number(L.linehaul || 0) + keep;
    soloGross += g;
    soloMiles += Number(L.miles || 0) + Number(L.empty_miles || 0);
    detentionSum += detSum;
    detentionPaidOnLoad += detPaid;
    detentionKept += keep;
  }

  let shareGross = 0;
  let shareMiles = 0;
  for (const r of routes) {
    if (Number(r.driver_count || 0) < 2) continue;
    shareGross += Number(r.revenue || 0);
    shareMiles += Number(r.loaded_miles || 0) + Number(r.empty_miles || 0);
  }

  // For solo orphan routes (count>=? or count=1 with no load.driver) — match GP: skip if already in soloLoadIds
  for (const r of routes) {
    const count = Number(r.driver_count || 0);
    if (count >= 2) continue;
    if (soloLoadIds.has(Number(r.load_id))) continue;
    // orphan / helper route miles + revenue if any
    shareMiles += Number(r.loaded_miles || 0) + Number(r.empty_miles || 0);
    shareGross += Number(r.revenue || 0);
  }

  const liveGross = soloGross + shareGross;
  const liveMiles = soloMiles + shareMiles;

  const accTotal = acc.reduce((s, a) => s + Number(a.amount || 0), 0);
  const accByCat = {};
  for (const a of acc) {
    const c = String(a.category || 'other');
    accByCat[c] = r2((accByCat[c] || 0) + Number(a.amount || 0));
  }

  // Pay rebuild
  const loadedMiles = (() => {
    let lm = 0;
    for (const L of liveLoads) {
      if (L.error) continue;
      const count = Number(L.driver_count || 0);
      if (count < 2 && Number(L.driver_id) === f.id) lm += Number(L.miles || 0);
    }
    for (const r of routes) {
      if (Number(r.driver_count || 0) >= 2) lm += Number(r.loaded_miles || 0);
      else if (!soloLoadIds.has(Number(r.load_id)))
        lm += Number(r.loaded_miles || 0);
    }
    return lm;
  })();
  const emptyMiles = Math.max(0, liveMiles - loadedMiles);

  let payBase = 0;
  const status = String(comp?.status || '');
  if (status === 'Per Mile') {
    const lr = Number(comp.loaded_mile_rate || 0);
    const er = Number(comp.empty_mile_rate ?? comp.loaded_mile_rate ?? 0);
    payBase = loadedMiles * lr + emptyMiles * er;
  } else if (status === 'Percentage') {
    payBase = (liveGross * Number(comp.linehaul_percentage || 0)) / 100;
  } else if (status === 'Flat') {
    payBase = Number(comp.flat_rate || 0);
  }
  const livePay = r2(payBase + accTotal);

  const [orf] = await pool.query(
    `SELECT diesel_gallons, diesel_net, txn_count FROM openroad_fuel_week_totals
      WHERE year=? AND week=? AND driver_id=?`,
    [YEAR, WEEK, f.id]
  );
  const fuel =
    orf[0] && Number(orf[0].diesel_gallons) > 0
      ? {
          gal: Number(orf[0].diesel_gallons),
          net: Number(orf[0].diesel_net),
          ppg: r2(Number(orf[0].diesel_net) / Number(orf[0].diesel_gallons)),
          txns: orf[0].txn_count,
        }
      : null;

  const row = {
    id: f.id,
    key: f.key,
    name: gp?.driver_name || sheet?.name || f.key,
    comp: comp
      ? {
          name: comp.name,
          status: comp.status,
          loaded: money(comp.loaded_mile_rate),
          empty: money(comp.empty_mile_rate),
          pct: money(comp.linehaul_percentage),
        }
      : null,
    sheet: sheet && {
      mi: sheet.mileage,
      gross: sheet.gross,
      pay: sheet.pay,
      ppg: sheet.ppg,
      mpg: sheet.mpg,
      prepass: sheet.prepass,
    },
    gp: gp && {
      mi: Number(gp.mileage),
      gross: Number(gp.gross_income),
      pay: Number(gp.drivers_pay),
      ppg: gp.fuel_ppg == null ? null : Number(gp.fuel_ppg),
      mpg: gp.fuel_mpg == null ? null : Number(gp.fuel_mpg),
      prepass: Number(gp.prepass),
    },
    live: {
      loads: liveLoads.length,
      miles: r2(liveMiles),
      loadedMiles: r2(loadedMiles),
      emptyMiles: r2(emptyMiles),
      gross: r2(liveGross),
      soloGross: r2(soloGross),
      shareGross: r2(shareGross),
      detentionSum: r2(detentionSum),
      detentionPaid: r2(detentionPaidOnLoad),
      detentionKept: r2(detentionKept),
      pay: livePay,
      payBase: r2(payBase),
      accessorials: r2(accTotal),
      accByCat,
      fuel,
    },
    liveLoadDetails: liveLoads.map((L) =>
      L.error
        ? L
        : {
            id: L.id,
            status: L.status,
            driver_id: L.driver_id,
            helper: L.helper_driver_id,
            count: L.driver_count,
            mi: (L.miles || 0) + (L.empty_miles || 0),
            linehaul: L.linehaul,
            detention: L.detention_sum,
            detPaid: r2(
              L.accessorials
                .filter((a) =>
                  String(a.cat || '').toLowerCase().includes('detention')
                )
                .reduce((s, a) => s + Number(a.amt || 0), 0)
            ),
            acc: L.accessorials,
          }
    ),
    routes: routes.map((r) => ({
      load: r.load_id,
      count: r.driver_count,
      mi: r2(Number(r.loaded_miles || 0) + Number(r.empty_miles || 0)),
      rev: money(r.revenue),
    })),
    deltas: {
      sheet_vs_gp: sheet && gp && {
        mi: r2(Number(gp.mileage) - (sheet.mileage || 0)),
        gross: r2(Number(gp.gross_income) - (sheet.gross || 0)),
        pay: r2(Number(gp.drivers_pay) - (sheet.pay || 0)),
        ppg:
          sheet.ppg != null && gp.fuel_ppg != null
            ? r2(Number(gp.fuel_ppg) - sheet.ppg)
            : null,
      },
      live_vs_gp: gp && {
        mi: r2(liveMiles - Number(gp.mileage)),
        gross: r2(liveGross - Number(gp.gross_income)),
        pay: r2((livePay || 0) - Number(gp.drivers_pay)),
      },
      live_vs_sheet: sheet && {
        mi: r2(liveMiles - (sheet.mileage || 0)),
        gross: r2(liveGross - (sheet.gross || 0)),
        pay: r2((livePay || 0) - (sheet.pay || 0)),
      },
    },
  };
  results.push(row);
  console.log(
    JSON.stringify({
      name: row.name,
      sheet: row.sheet,
      gp: row.gp,
      live: {
        mi: row.live.miles,
        gross: row.live.gross,
        pay: row.live.pay,
        detKeep: row.live.detentionKept,
        acc: row.live.accessorials,
        fuelPpg: row.live.fuel?.ppg,
      },
      dSheetGp: row.deltas.sheet_vs_gp,
      dLiveSheet: row.deltas.live_vs_sheet,
    })
  );
}

await pool.end();
fs.writeFileSync(
  'tmp/live-reconcile-w43.json',
  JSON.stringify({ week: WEEK, start: START, end: END, results }, null, 2)
);
console.log('\nWROTE tmp/live-reconcile-w43.json');
