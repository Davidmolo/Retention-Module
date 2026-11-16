// Load AZFS Relay key from fuel-optimizer / FMS-side env (RELAY_API_KEY_AZFS),
// map to grossProfit RELAY_API_KEY, sync W43, then diesel-only PPG vs OpenRoad.
import fs from 'fs';
import path from 'path';
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

const candidates = [
  'D:/azfs/fuel-optimizer/backend/.env.local',
  'D:/azfs/fuel-optimizer/backend/.env',
  'D:/azfs/fuel-optimizer/.env.local',
  'D:/azfs/fuel-optimizer/.env',
  'D:/azfs/david-fuel-distribution-v2/admin-dashboard-backend/.env',
  'D:/azfs/david-fuel-distribution-v2/admin-dashboard-backend/.env.local',
];

let key = process.env.RELAY_API_KEY?.trim() || '';
let keySource = key ? 'grossProfit env' : '';
for (const file of candidates) {
  const env = readEnvFile(file);
  const k =
    env.RELAY_API_KEY_AZFS?.trim() ||
    env.RELAY_API_KEY?.trim() ||
    env.RELAY_PAYMENTS_API_KEY?.trim() ||
    '';
  if (k) {
    key = k;
    keySource = file;
    if (env.RELAY_API_BASE_URL && !process.env.RELAY_API_URL) {
      process.env.RELAY_API_URL = env.RELAY_API_BASE_URL;
    }
    if (env.RELAY_PAYMENTS_API_URL && !process.env.RELAY_API_URL) {
      process.env.RELAY_API_URL = env.RELAY_PAYMENTS_API_URL;
    }
    break;
  }
}

if (!key) {
  console.error('No Relay key found in FMS/fuel-optimizer env files');
  process.exit(1);
}

process.env.RELAY_API_KEY = key;
console.log('Relay key loaded from', keySource, '(len', key.length + ')');
console.log('RELAY_API_URL', process.env.RELAY_API_URL || '(default)');

const year = Number(process.argv[2] || 2026);
const week = Number(process.argv[3] || 43);

const { syncRelayFuelForWeek } = await import('../lib/relay/syncFuel.ts');
const { fetchFuelTransactions } = await import('../lib/relay/client.ts');
const { toAppCalendarDate } = await import('../lib/dates.ts');
const { weekRange } = await import('../lib/week.ts');

const sync = await syncRelayFuelForWeek(year, week);
console.log('syncRelayFuelForWeek', sync);

const { start, end } = weekRange(year, week);
const raw = await fetchFuelTransactions({
  dtstart: `${start}T00:00:00Z`,
  // pad end so Chicago evening txns included; filter by local date below
  dtend: `${end}T23:59:59Z`,
});

function isDiesel(item) {
  const t = String(item.fuel_type ?? '').toLowerCase();
  return t === 'diesel' || t.startsWith('diesel_') || t === 'biodiesel';
}

// Chambers focus + aggregate diesel-only PPG for focus drivers
const FOCUS_NAMES = [
  'chambers',
  'meighan',
  'mcgrew',
  'nedeljkovic',
  'evariste',
  'roberson',
  'crayton',
  'elias',
  'turner',
  'moreland',
  'brittain',
  'gilbert',
  'kincaid',
];

const byDriver = new Map();
let inWeek = 0;
for (const t of raw) {
  const local = toAppCalendarDate(t.created_at);
  if (!local || local < start || local > end) continue;
  inWeek += 1;
  const d = t.driver || {};
  const name = `${d.first_name || ''} ${d.last_name || ''}`.trim().toLowerCase();
  let dieselGal = 0;
  let dieselPaid = 0;
  let dieselRetail = 0;
  for (const item of t.fuel_items || []) {
    if (!isDiesel(item)) continue;
    const g = Number(item.volume || 0);
    dieselGal += Number.isFinite(g) ? g : 0;
    const paid = Number(item.total_discounted_price || 0);
    const retail = Number(item.total_retail_price || 0);
    dieselPaid += Number.isFinite(paid) ? paid : 0;
    dieselRetail += Number.isFinite(retail) ? retail : 0;
  }
  const keyName =
    FOCUS_NAMES.find((f) => name.includes(f)) ||
    name ||
    String(d.integration_id || t.transaction_id);
  const cur = byDriver.get(keyName) || {
    name,
    gal: 0,
    dieselPaid: 0,
    dieselRetail: 0,
    txnPaid: 0,
    txnRetail: 0,
    txns: 0,
  };
  cur.gal += dieselGal;
  cur.dieselPaid += dieselPaid;
  cur.dieselRetail += dieselRetail;
  cur.txnPaid += Number(t.total_amount_paid || 0);
  cur.txnRetail += Number(t.total_retail_price || 0);
  cur.txns += 1;
  byDriver.set(keyName, cur);
}

console.log('Relay live txns fetched', raw.length, 'in-week', inWeek);

const focus = [];
for (const f of FOCUS_NAMES) {
  const hit = [...byDriver.entries()].find(([k]) => k.includes(f));
  if (!hit) {
    focus.push({ key: f, missing: true });
    continue;
  }
  const [, v] = hit;
  focus.push({
    key: f,
    name: v.name,
    txns: v.txns,
    dieselGal: Math.round(v.gal * 1000) / 1000,
    dieselPaid: Math.round(v.dieselPaid * 100) / 100,
    dieselPpg:
      v.gal > 0 ? Math.round((v.dieselPaid / v.gal) * 10000) / 10000 : null,
    txnPaid: Math.round(v.txnPaid * 100) / 100,
    txnPpg:
      v.gal > 0 ? Math.round((v.txnPaid / v.gal) * 10000) / 10000 : null,
  });
}

console.log('\nRelay LIVE diesel-only vs txn-paid PPG:');
for (const r of focus) console.log(JSON.stringify(r));

fs.writeFileSync(
  path.join(process.cwd(), 'tmp/relay-live-w43.json'),
  JSON.stringify(
    { year, week, start, end, sync, focus, keySource },
    null,
    2
  )
);
console.log('\nWROTE tmp/relay-live-w43.json');
