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

const accounts = [
  ['AZFS', fo.RELAY_API_KEY_AZFS],
  ['BLUE_STALLION', fo.RELAY_API_KEY_BLUE_STALLION],
].filter(([, k]) => k && String(k).trim());

// Transactions endpoint is WITHOUT /integrations (per FMS relay_doc.md)
const txnBase = 'https://app.relaypayments.com/api';

async function probe(label, apiKey) {
  const url = `${txnBase}/fuel/transactions/?dtstart=2026-10-12T00:00:00Z&dtend=2026-10-21T00:00:00Z`;
  const res = await fetch(url, {
    headers: { Authorization: apiKey.trim(), Accept: 'application/json' },
  });
  const text = await res.text();
  if (!res.ok) {
    console.log(label, 'FAIL', res.status, text.slice(0, 180));
    return;
  }
  let rows;
  try {
    rows = JSON.parse(text);
  } catch {
    console.log(label, 'bad json', text.slice(0, 120));
    return;
  }
  if (!Array.isArray(rows)) {
    console.log(label, 'not array', Object.keys(rows || {}));
    return;
  }
  const names = new Map();
  let chambers = null;
  for (const t of rows) {
    const d = t.driver || {};
    const name = `${d.first_name || ''} ${d.last_name || ''}`.trim();
    names.set(name, (names.get(name) || 0) + 1);
    if (/chambers/i.test(name)) {
      chambers = chambers || { name, n: 0, paid: 0 };
      chambers.n += 1;
      chambers.paid += Number(t.total_amount_paid || 0);
    }
  }
  console.log(
    JSON.stringify({
      label,
      txns: rows.length,
      drivers: names.size,
      chambers,
      sample: [...names.keys()].filter(Boolean).slice(0, 12),
    })
  );
}

for (const [label, key] of accounts) {
  await probe(label, key);
}
