import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());
const { fetchOpenRoadJson } = await import('../lib/openroad/client.ts');

const start = '2026-10-13';
const end = '2026-10-19';
const base = 'https://app.openroadtms.com/api/ext/v1/fuel_card_transactions';

let page = 1;
let found = [];
while (page <= 40) {
  const json = await fetchOpenRoadJson(
    `${base}?per_page=100&page=${page}&date[gte]=${start}&date[lte]=${end}`
  );
  const items = Array.isArray(json?.data) ? json.data : [];
  if (!items.length) break;
  for (const r of items) {
    if (Number(r.driver_id) === 24215) found.push(r);
  }
  const last = json?.meta?.last_page;
  if (last != null && page >= last) break;
  if (items.length < 100) break;
  page += 1;
}

console.log('rows', found.length);
let gal = 0,
  dieselAmt = 0,
  discount = 0,
  total = 0,
  other = 0;
let wNet = 0;
for (const r of found) {
  const g = Number(r.diesel_gallons || 0);
  const a = Number(r.diesel_amount || 0);
  const d = Number(r.discount || 0);
  const t = Number(r.total || 0);
  const o = Number(r.other || 0);
  const n = Number(r.net_pg || 0);
  gal += g;
  dieselAmt += a;
  discount += d;
  total += t;
  other += o;
  wNet += n * g;
  console.log({
    date: r.date,
    unit: r.unit,
    gal: g,
    dieselAmt: a,
    discount: d,
    net_pg: n,
    other: o,
    total: t,
    paidDiesel: a - d,
    check: g > 0 ? (a - d) / g : null,
  });
}
console.log('\nTOTALS', {
  gal: Number(gal.toFixed(3)),
  dieselAmt: Number(dieselAmt.toFixed(2)),
  discount: Number(discount.toFixed(2)),
  dieselNet: Number((dieselAmt - discount).toFixed(2)),
  ppgFromDieselNet: gal > 0 ? Number(((dieselAmt - discount) / gal).toFixed(4)) : null,
  ppgWeightedNetPg: gal > 0 ? Number((wNet / gal).toFixed(4)) : null,
  total: Number(total.toFixed(2)),
  other: Number(other.toFixed(2)),
});
