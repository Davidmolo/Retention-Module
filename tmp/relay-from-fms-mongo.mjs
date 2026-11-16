// Pull XXII Century Relay key from FMS Mongo (company.relayPaymentId), sync W43.
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

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

const fmsRoot = 'D:/azfs/david-fuel-distribution-v2/admin-dashboard-backend';
const env = {
  ...readEnv(path.join(fmsRoot, '.env')),
  ...readEnv(path.join(fmsRoot, '.env.local')),
  ...readEnv(path.join(fmsRoot, '.env.production')),
};
const uri = env.MONGODB_URI || env.MONGO_URI || env.MONGO_URL || '';
if (!uri) {
  console.error('No FMS Mongo URI');
  process.exit(1);
}
console.log('FMS Mongo URI present, len', uri.length);

const require = createRequire(path.join(fmsRoot, 'package.json'));
const mongoose = require('mongoose');

await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
const db = mongoose.connection.db;

// Find company collection name
const cols = await db.listCollections().toArray();
const colNames = cols.map((c) => c.name);
console.log(
  'collections with company-ish names',
  colNames.filter((n) => /compan|vendor|onboard/i.test(n))
);

const candidates = colNames.filter((n) =>
  /compan/i.test(n)
);
let companies = [];
for (const name of candidates.length ? candidates : ['companies', 'company']) {
  try {
    const rows = await db
      .collection(name)
      .find({
        relayPaymentId: { $exists: true, $nin: ['', null] },
      })
      .project({ companyname: 1, name: 1, relayPaymentId: 1 })
      .toArray();
    if (rows.length) {
      console.log('collection', name, 'relay companies', rows.length);
      companies = rows.map((r) => ({
        collection: name,
        id: String(r._id),
        name: r.companyname || r.name || '',
        keyLen: String(r.relayPaymentId || '').trim().length,
        keyPrefix: String(r.relayPaymentId || '').trim().slice(0, 6),
        relayPaymentId: String(r.relayPaymentId || '').trim(),
      }));
      break;
    }
  } catch (e) {
    console.log('skip', name, e.message);
  }
}

console.log(
  'companies:',
  companies.map((c) => ({
    name: c.name,
    keyLen: c.keyLen,
    keyPrefix: c.keyPrefix,
  }))
);

const xxii =
  companies.find((c) => /xxii/i.test(c.name)) ||
  companies.find((c) => /century/i.test(c.name)) ||
  companies.find((c) => /pools/i.test(c.name));

if (!xxii) {
  console.error('No XXII/Century/Pools company with relayPaymentId');
  await mongoose.disconnect();
  process.exit(1);
}

console.log('Using company', xxii.name, 'keyPrefix', xxii.keyPrefix);

process.env.RELAY_API_KEY = xxii.relayPaymentId;
process.env.RELAY_API_URL =
  process.env.RELAY_API_URL || 'https://app.relaypayments.com/api';

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
const by = new Map();
for (const t of raw) {
  const local = toAppCalendarDate(t.created_at);
  if (!local || local < '2026-10-13' || local > '2026-10-19') continue;
  const d = t.driver || {};
  const name = `${d.first_name || ''} ${d.last_name || ''}`.trim();
  const key =
    focusKeys.find((f) => name.toLowerCase().includes(f)) ||
    name.toLowerCase();
  let dieselGal = 0;
  let dieselPaid = 0;
  for (const item of t.fuel_items || []) {
    if (!isDiesel(item)) continue;
    dieselGal += Number(item.volume || 0) || 0;
    dieselPaid += Number(item.total_discounted_price || 0) || 0;
  }
  const cur = by.get(key) || {
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
  by.set(key, cur);
}

const focus = focusKeys.map((f) => {
  const v = by.get(f);
  if (!v) return { key: f, missing: true };
  return {
    key: f,
    name: v.name,
    txns: v.txns,
    dieselGal: Math.round(v.gal * 1000) / 1000,
    dieselPpg:
      v.gal > 0 ? Math.round((v.dieselPaid / v.gal) * 10000) / 10000 : null,
    txnPpg: v.gal > 0 ? Math.round((v.txnPaid / v.gal) * 10000) / 10000 : null,
    dieselPaid: Math.round(v.dieselPaid * 100) / 100,
    txnPaid: Math.round(v.txnPaid * 100) / 100,
  };
});

console.log('focus', JSON.stringify(focus, null, 2));
fs.writeFileSync(
  'tmp/relay-live-xxii-w43.json',
  JSON.stringify(
    {
      company: xxii.name,
      sync,
      fetched: raw.length,
      focus,
    },
    null,
    2
  )
);

await mongoose.disconnect();
console.log('WROTE tmp/relay-live-xxii-w43.json');
