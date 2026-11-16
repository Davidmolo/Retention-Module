import fs from 'fs';
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
    )
      v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

const fo = {
  ...readEnvFile('D:/azfs/fuel-optimizer/backend/.env'),
  ...readEnvFile('D:/azfs/fuel-optimizer/backend/.env.local'),
};

const accounts = [
  ['AZFS', fo.RELAY_API_KEY_AZFS],
  ['BLUE_STALLION', fo.RELAY_API_KEY_BLUE_STALLION],
].filter(([, k]) => k && k.trim());

const base = (
  fo.RELAY_API_BASE_URL ||
  process.env.RELAY_API_URL ||
  'https://app.relaypayments.com/api'
).replace(/\/$/, '');

async function fetchRange(apiKey, label) {
  const url = new URL(`${base}/fuel/transactions/`);
  // wider pad
  url.searchParams.set('dtstart', '2026-10-12T00:00:00Z');
  url.searchParams.set('dtend', '2026-10-21T00:00:00Z');
  const res = await fetch(url, {
    headers: { Authorization: apiKey.trim(), Accept: 'application/json' },
  });
  const text = await res.text();
  if (!res.ok) {
    console.log(label, 'FAIL', res.status, text.slice(0, 200));
    return [];
  }
  const json = JSON.parse(text);
  const rows = Array.isArray(json) ? json : [];
  const names = new Map();
  let dieselGal = 0;
  let hasChambers = false;
  for (const t of rows) {
    const d = t.driver || {};
    const name = `${d.first_name || ''} ${d.last_name || ''}`.trim();
    names.set(name, (names.get(name) || 0) + 1);
    if (/chambers/i.test(name)) hasChambers = true;
    for (const item of t.fuel_items || []) {
      const ft = String(item.fuel_type || '').toLowerCase();
      if (ft === 'diesel' || ft.startsWith('diesel_') || ft === 'biodiesel') {
        dieselGal += Number(item.volume || 0) || 0;
      }
    }
  }
  console.log(
    JSON.stringify({
      label,
      keyLen: apiKey.trim().length,
      txns: rows.length,
      drivers: names.size,
      hasChambers,
      dieselGal: Math.round(dieselGal),
      sampleNames: [...names.keys()].slice(0, 15),
    })
  );
  return rows;
}

for (const [label, key] of accounts) {
  await fetchRange(key, label);
}

// Also peek FMS env for any relay key names (not values)
const fmsEnv = {
  ...readEnvFile(
    'D:/azfs/david-fuel-distribution-v2/admin-dashboard-backend/.env'
  ),
  ...readEnvFile(
    'D:/azfs/david-fuel-distribution-v2/admin-dashboard-backend/.env.local'
  ),
};
const fmsRelayKeys = Object.keys(fmsEnv).filter((k) => /relay/i.test(k));
console.log('FMS env relay-related keys:', fmsRelayKeys);
console.log(
  'FMS has non-empty relayPayment-like?',
  fmsRelayKeys.map((k) => [k, !!fmsEnv[k] && fmsEnv[k].length > 0])
);
