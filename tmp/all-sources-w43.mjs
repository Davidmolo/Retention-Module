import fs from 'fs';
import nextEnv from '@next/env';
import XLSX from 'xlsx';
import mysql from 'mysql2/promise';

nextEnv.loadEnvConfig(process.cwd());

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
function r2(v) {
  return v == null || !Number.isFinite(Number(v))
    ? null
    : Math.round(Number(v) * 100) / 100;
}
function money(v) {
  const n = num(v);
  return n == null ? null : Math.round(n * 100) / 100;
}

const sources = {
  openroad: !!process.env.OPENROAD_API_USERNAME,
  relayKey: !!(process.env.RELAY_API_KEY && process.env.RELAY_API_KEY.trim()),
  prepass: !!(
    process.env.PREPASS_CLIENT_ID && process.env.PREPASS_CLIENT_SECRET
  ),
};
console.log('sources available', sources);

// --- Sync PrePass live for W43 (± buffer on post date) ---
let prepassSync = null;
if (sources.prepass) {
  try {
    const { syncTolls, linkTollsToTrucks } = await import(
      '../lib/prepass/sync.ts'
    );
    prepassSync = await syncTolls({
      start: '2026-10-10',
      end: '2026-10-25',
    });
    const linked = await linkTollsToTrucks();
    prepassSync.linkedExtra = linked;
    console.log('PrePass sync', prepassSync);
  } catch (e) {
    prepassSync = { error: e.message };
    console.log('PrePass sync FAILED', e.message);
  }
}

// --- Relay live ---
let relayTxns = [];
let relayError = null;
if (sources.relayKey) {
  try {
    const { fetchFuelTransactions } = await import('../lib/relay/client.ts');
    const { toAppCalendarDate } = await import('../lib/dates.ts');
    const { syncRelayFuelForWeek } = await import('../lib/relay/syncFuel.ts');
    const sync = await syncRelayFuelForWeek(YEAR, WEEK);
    console.log('Relay sync', sync);
    relayTxns = await fetchFuelTransactions({
      dtstart: '2026-10-12T00:00:00Z',
      dtend: '2026-10-21T00:00:00Z',
    });
    console.log('Relay raw txns', relayTxns.length);
  } catch (e) {
    relayError = e.message;
    console.log('Relay FAILED', e.message);
  }
} else {
  relayError = 'RELAY_API_KEY not set locally';
  console.log(relayError);
}

// --- OpenRoad fuel already in openroad_fuel_week_totals; refresh W43 ---
let orFuelSync = null;
try {
  const { syncOpenRoadFuelForWeek } = await import(
    '../lib/openroad/fuelCardTransactions.ts'
  );
  orFuelSync = await syncOpenRoadFuelForWeek(YEAR, WEEK);
  console.log('OpenRoad fuel sync', orFuelSync);
} catch (e) {
  orFuelSync = { error: e.message };
  console.log('OpenRoad fuel FAILED', e.message);
}

// Sheet parse (trusted fields via name match from compare later)
const { mismatches } = JSON.parse(
  fs.readFileSync('tmp/gp-compare.json', 'utf8')
);

const pool = await mysql.createConnection(process.env.DATABASE_URL);
const rows = [];

for (const f of FOCUS) {
  const [gpRows] = await pool.query(
    `SELECT driver_name, mileage, gross_income, drivers_pay, fuel_ppg, fuel_mpg,
            fuel, prepass, unit
       FROM gross_profit_reports
      WHERE year=? AND week=? AND driver_id=?`,
    [YEAR, WEEK, f.id]
  );
  const gp = gpRows[0];

  const [orf] = await pool.query(
    `SELECT diesel_gallons, diesel_net, diesel_amount, discount, txn_count
       FROM openroad_fuel_week_totals WHERE year=? AND week=? AND driver_id=?`,
    [YEAR, WEEK, f.id]
  );
  const orFuel = orf[0]
    ? {
        gal: Number(orf[0].diesel_gallons),
        net: Number(orf[0].diesel_net),
        ppg:
          Number(orf[0].diesel_gallons) > 0
            ? r2(Number(orf[0].diesel_net) / Number(orf[0].diesel_gallons))
            : null,
        txns: orf[0].txn_count,
      }
    : null;

  const [rf] = await pool.query(
    `SELECT amount_retail, amount_paid, amount_saved, gallons, txn_count
       FROM relay_fuel_week_totals WHERE year=? AND week=? AND driver_id=?`,
    [YEAR, WEEK, f.id]
  );
  const relay = rf[0]
    ? {
        retail: Number(rf[0].amount_retail),
        paid: Number(rf[0].amount_paid),
        saved: Number(rf[0].amount_saved),
        gal: rf[0].gallons == null ? null : Number(rf[0].gallons),
        ppg:
          rf[0].gallons && Number(rf[0].gallons) > 0
            ? r2(Number(rf[0].amount_paid) / Number(rf[0].gallons))
            : null,
        // diesel-only estimate not stored; paid includes DEF
        txns: rf[0].txn_count,
        note: 'amount_paid includes DEF/other; gallons are diesel-only → PPG inflated if used raw',
      }
    : null;

  // Live PrePass: sum toll_charge by exit_date in week on assigned trucks
  const [pp] = await pool.query(
    `SELECT COALESCE(SUM(tt.toll_charge),0) AS prepass,
            COUNT(*) AS toll_n
       FROM toll_transactions tt
       JOIN assignments a ON a.truck_id = tt.truck_id
      WHERE a.driver_id = ?
        AND tt.truck_id IS NOT NULL
        AND DATE(COALESCE(tt.exit_date, tt.post_date)) BETWEEN ? AND ?
        AND DATE(a.start_date) <= DATE(COALESCE(tt.exit_date, tt.post_date))
        AND (a.end_date IS NULL OR DATE(a.end_date) >= DATE(COALESCE(tt.exit_date, tt.post_date)))`,
    [f.id, START, END]
  );
  const prepassLive = {
    amount: Number(pp[0]?.prepass || 0),
    tolls: Number(pp[0]?.toll_n || 0),
  };

  const cmp = mismatches.find((m) => m.week === 43 && m.id === f.id);
  const sheet = {};
  if (cmp) {
    for (const d of cmp.diffs) {
      sheet[d.field] = { sheet: d.sheet, gp: d.db, delta: d.delta };
    }
  }

  // Also get sheet prepass/ppg even when matched — from gp-compare only has diffs.
  // Pull full sheet card from W43.xlsx by last-name exact from compare script style
  rows.push({
    id: f.id,
    key: f.key,
    name: gp?.driver_name || f.key,
    unit: gp?.unit,
    sheetGaps: cmp
      ? cmp.diffs.filter((d) =>
          ['mileage', 'gross', 'pay', 'ppg', 'prepass', 'mpg'].includes(d.field)
        )
      : [],
    gp: gp && {
      mi: Number(gp.mileage),
      gross: Number(gp.gross_income),
      pay: Number(gp.drivers_pay),
      ppg: gp.fuel_ppg == null ? null : Number(gp.fuel_ppg),
      mpg: gp.fuel_mpg == null ? null : Number(gp.fuel_mpg),
      prepass: Number(gp.prepass),
      fuel: Number(gp.fuel),
    },
    openroadFuel: orFuel,
    relayFuel: relay,
    prepassLive,
    deltas: {
      ppg_or_vs_gp:
        orFuel?.ppg != null && gp?.fuel_ppg != null
          ? r2(orFuel.ppg - Number(gp.fuel_ppg))
          : null,
      ppg_relay_vs_or:
        relay?.ppg != null && orFuel?.ppg != null
          ? r2(relay.ppg - orFuel.ppg)
          : null,
      prepass_live_vs_gp: gp
        ? r2(prepassLive.amount - Number(gp.prepass))
        : null,
    },
  });
}

// Parse sheet cards for focus prepass/ppg absolute values
function parseSheet(file) {
  const buf = fs.readFileSync(file);
  const wb = XLSX.read(buf, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rowsX = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    raw: true,
    defval: null,
  });
  const out = [];
  for (let r = 0; r < rowsX.length; r++) {
    const row = rowsX[r] || [];
    for (let c = 0; c < row.length; c += 5) {
      const name = row[c];
      if (typeof name !== 'string') continue;
      if (String(rowsX[r + 1]?.[c] || '').trim() !== 'RATE $') continue;
      const block = {};
      for (let k = 1; k <= 25 && r + k < rowsX.length; k++) {
        const lab = String(rowsX[r + k]?.[c] || '').trim();
        if (!lab) continue;
        block[lab] = {
          a: rowsX[r + k]?.[c + 1] ?? null,
          b: rowsX[r + k]?.[c + 2] ?? null,
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
const sheetCards = parseSheet('D:/azfs/grossProfit/tmp/W43.xlsx');

for (const row of rows) {
  const card =
    sheetCards.find((s) => s.sheetId === row.id) ||
    sheetCards.find((s) =>
      s.name.toLowerCase().includes(row.key.toLowerCase())
    );
  // Prefer compare-gp absolute via reconstructing: gp - delta for each gap field
  const abs = {
    ppg: row.gp?.ppg,
    prepass: row.gp?.prepass,
    gross: row.gp?.gross,
    pay: row.gp?.pay,
    mi: row.gp?.mi,
  };
  for (const d of row.sheetGaps) {
    if (d.sheet != null) {
      if (d.field === 'ppg') abs.ppg_sheet = d.sheet;
      if (d.field === 'prepass') abs.prepass_sheet = d.sheet;
      if (d.field === 'gross') abs.gross_sheet = d.sheet;
      if (d.field === 'pay') abs.pay_sheet = d.sheet;
      if (d.field === 'mileage') abs.mi_sheet = d.sheet;
    }
  }
  // fill sheet abs from card when compare had no gap (matched)
  if (card) {
    if (abs.ppg_sheet == null) abs.ppg_sheet = card.ppg;
    if (abs.prepass_sheet == null) abs.prepass_sheet = card.prepass;
    if (abs.gross_sheet == null) abs.gross_sheet = card.gross;
    if (abs.pay_sheet == null) abs.pay_sheet = card.pay;
    if (abs.mi_sheet == null) abs.mi_sheet = card.mileage;
  }
  row.sheetAbs = abs;

  console.log(
    `\n${row.name}\n  sheet ppg=${abs.ppg_sheet} prepass=${abs.prepass_sheet} gross=${abs.gross_sheet} pay=${abs.pay_sheet}\n  gp    ppg=${row.gp?.ppg} prepass=${row.gp?.prepass} gross=${row.gp?.gross} pay=${row.gp?.pay}\n  OR    ppg=${row.openroadFuel?.ppg} gal=${row.openroadFuel?.gal}\n  Relay ppg=${row.relayFuel?.ppg} paid=${row.relayFuel?.paid} gal=${row.relayFuel?.gal} (${row.relayFuel ? 'DB' : 'none'})\n  PrePass live=${row.prepassLive.amount} (n=${row.prepassLive.tolls}) gpΔ=${row.deltas.prepass_live_vs_gp}`
  );
}

await pool.end();

const out = {
  week: WEEK,
  sources,
  prepassSync,
  orFuelSync,
  relayError,
  relayTxnCount: relayTxns.length,
  rows,
};
fs.writeFileSync('tmp/all-sources-w43.json', JSON.stringify(out, null, 2));
console.log('\nWROTE tmp/all-sources-w43.json');
