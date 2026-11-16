// XXII fleet Relay key in FO is labeled BLUE_STALLION (has Chambers).
import fs from 'fs';

function readEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    )
      v = v.slice(1, -1);
    out[k] = v;
  }
  return out;
}

const fo = {
  ...readEnv('D:/azfs/fuel-optimizer/backend/.env'),
  ...readEnv('D:/azfs/fuel-optimizer/backend/.env.local'),
  ...readEnv('D:/azfs/fuel-optimizer/backend/.env.prod'),
};

const key = fo.RELAY_API_KEY_BLUE_STALLION?.trim();
if (!key) {
  console.error('missing RELAY_API_KEY_BLUE_STALLION');
  process.exit(1);
}
process.env.RELAY_API_KEY = key;
process.env.RELAY_API_URL = 'https://app.relaypayments.com/api';
console.log('Using Blue Stallion / XXII Relay key len', key.length);

const { syncRelayFuelForWeek } = await import('../lib/relay/syncFuel.ts');
const { fetchFuelTransactions } = await import('../lib/relay/client.ts');
const { toAppCalendarDate } = await import('../lib/dates.ts');

const sync = await syncRelayFuelForWeek(2026, 43);
console.log('sync', sync);

const raw = await fetchFuelTransactions({
  dtstart: '2026-10-12T00:00:00Z',
  dtend: '2026-10-21T00:00:00Z',
});

function isDiesel(item) {
  const t = String(item.fuel_type ?? '').toLowerCase();
  return t === 'diesel' || t.startsWith('diesel_') || t === 'biodiesel';
}

const focusKeys = [
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

// OR PPG from previous sync file
const orFile = JSON.parse(
  fs.readFileSync('tmp/all-sources-w43.json', 'utf8')
);
const orByKey = new Map(
  (orFile.rows || []).map((r) => [r.key.toLowerCase(), r.openroadFuel?.ppg])
);
const sheetByKey = new Map(
  (orFile.rows || []).map((r) => [
    r.key.toLowerCase(),
    r.sheetAbs?.ppg_sheet ?? r.gp?.ppg,
  ])
);

const by = new Map();
for (const t of raw) {
  const local = toAppCalendarDate(t.created_at);
  if (!local || local < '2026-10-13' || local > '2026-10-19') continue;
  const d = t.driver || {};
  const name = `${d.first_name || ''} ${d.last_name || ''}`.trim();
  const keyName =
    focusKeys.find((f) => name.toLowerCase().includes(f)) || null;
  if (!keyName) continue;
  let dieselGal = 0;
  let dieselPaid = 0;
  for (const item of t.fuel_items || []) {
    if (!isDiesel(item)) continue;
    dieselGal += Number(item.volume || 0) || 0;
    dieselPaid += Number(item.total_discounted_price || 0) || 0;
  }
  const cur = by.get(keyName) || {
    name,
    gal: 0,
    dieselPaid: 0,
    txnPaid: 0,
    txns: 0,
  };
  cur.gal += dieselGal;
  cur.dieselPaid += dieselPaid;
  cur.txnPaid += Number(t.total_amount_paid || 0) || 0;
  cur.txns += 1;
  by.set(keyName, cur);
}

const focus = focusKeys.map((f) => {
  const v = by.get(f);
  if (!v) return { key: f, missing: true };
  const dieselPpg =
    v.gal > 0 ? Math.round((v.dieselPaid / v.gal) * 10000) / 10000 : null;
  const txnPpg =
    v.gal > 0 ? Math.round((v.txnPaid / v.gal) * 10000) / 10000 : null;
  return {
    key: f,
    name: v.name,
    txns: v.txns,
    dieselGal: Math.round(v.gal * 1000) / 1000,
    dieselPaid: Math.round(v.dieselPaid * 100) / 100,
    dieselPpg,
    txnPaid: Math.round(v.txnPaid * 100) / 100,
    txnPpg,
    openroadPpg: orByKey.get(f) ?? null,
    sheetPpg: sheetByKey.get(f) ?? null,
    diesel_vs_or:
      dieselPpg != null && orByKey.get(f) != null
        ? Math.round((dieselPpg - orByKey.get(f)) * 10000) / 10000
        : null,
    txn_vs_or:
      txnPpg != null && orByKey.get(f) != null
        ? Math.round((txnPpg - orByKey.get(f)) * 10000) / 10000
        : null,
  };
});

console.log('\nRelay LIVE (XXII/Blue Stallion key) vs OpenRoad vs sheet PPG:');
for (const r of focus) console.log(JSON.stringify(r));

fs.writeFileSync(
  'tmp/relay-live-xxii-w43.json',
  JSON.stringify({ sync, fetched: raw.length, focus }, null, 2)
);
console.log('\nWROTE tmp/relay-live-xxii-w43.json');
