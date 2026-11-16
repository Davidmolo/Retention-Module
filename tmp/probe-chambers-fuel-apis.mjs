import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());

const { fetchFuelTransactions } = await import('../lib/relay/client.ts');
const { fetchOpenRoadJson, fetchPage } = await import('../lib/openroad/client.ts');

const start = '2026-10-13';
const end = '2026-10-19';

function money(s) {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

console.log('=== RELAY Chambers W43 ===');
const txns = await fetchFuelTransactions({
  dtstart: '2026-10-12T00:00:00Z',
  dtend: '2026-10-21T00:00:00Z',
});
const chambers = txns.filter((t) => {
  const n = `${t.driver?.first_name ?? ''} ${t.driver?.last_name ?? ''}`.toLowerCase();
  return n.includes('calvin') && n.includes('chambers');
});
console.log('txn count', chambers.length);

let dieselGal = 0;
let dieselDisc = 0;
let dieselRetail = 0;
let fullPaid = 0;
let fullRetail = 0;
for (const t of chambers) {
  const day = String(t.created_at).slice(0, 10);
  if (day < start || day > end) continue;
  fullPaid += money(t.total_amount_paid);
  fullRetail += money(t.total_retail_price);
  for (const item of t.fuel_items ?? []) {
    const ft = String(item.fuel_type ?? '').toLowerCase();
    const isDiesel =
      ft === 'diesel' || ft.startsWith('diesel_') || ft === 'biodiesel';
    const vol = money(item.volume);
    const disc = money(item.total_discounted_price);
    const ret = money(item.total_retail_price);
    const ppg = money(item.discounted_price_per_unit);
    console.log({
      day,
      type: item.fuel_type,
      vol,
      disc,
      ret,
      ppg,
      isDiesel,
    });
    if (isDiesel) {
      dieselGal += vol;
      dieselDisc += disc || (ppg > 0 && vol > 0 ? ppg * vol : 0);
      dieselRetail += ret;
    }
  }
}
console.log({
  fullPaid: Number(fullPaid.toFixed(2)),
  fullRetail: Number(fullRetail.toFixed(2)),
  dieselGal: Number(dieselGal.toFixed(3)),
  dieselDisc: Number(dieselDisc.toFixed(2)),
  dieselRetail: Number(dieselRetail.toFixed(2)),
  dieselPpg: dieselGal > 0 ? Number((dieselDisc / dieselGal).toFixed(4)) : null,
});

console.log('\n=== OPENROAD fuel_card_transactions ===');
const base =
  process.env.OPENROAD_FUEL_CARD_TRANSACTIONS_URL ||
  'https://app.openroadtms.com/api/ext/v1/fuel_card_transactions';
try {
  let page = 1;
  let all = [];
  for (;;) {
    const url = `${base}?per_page=100&page=${page}&date[gte]=${start}&date[lte]=${end}`;
    const json = await fetchOpenRoadJson(url);
    const items = Array.isArray(json?.data)
      ? json.data
      : Array.isArray(json)
        ? json
        : [];
    all = all.concat(items);
    const last = json?.meta?.last_page ?? json?.meta?.total_pages;
    if (!items.length || (last != null && page >= last) || items.length < 100)
      break;
    page += 1;
    if (page > 50) break;
  }
  console.log('fetched', all.length, 'sample keys', all[0] && Object.keys(all[0]));
  const mine = all.filter((r) => {
    const name = String(
      r.driver_name ?? r.cardholder ?? r.driver?.name ?? ''
    ).toLowerCase();
    const did = r.driver_id ?? r.driver?.id;
    return name.includes('chambers') || did === 24215 || did === '24215';
  });
  console.log('chambers rows', mine.length);
  if (mine[0]) console.log('sample', JSON.stringify(mine[0], null, 2).slice(0, 2000));

  let gal = 0;
  let amt = 0;
  let netSum = 0;
  let netN = 0;
  for (const r of mine) {
    const g = Number(r.diesel_gallons ?? r.gallons ?? r.quantity ?? 0);
    const a = Number(
      r.diesel_amount ?? r.amount ?? r.total ?? r.driver_total ?? 0
    );
    const ppg = Number(r.net_price_per_gallon ?? r.net_p_g ?? r.price_per_gallon);
    gal += Number.isFinite(g) ? g : 0;
    amt += Number.isFinite(a) ? a : 0;
    if (Number.isFinite(ppg) && ppg > 0) {
      netSum += ppg;
      netN += 1;
    }
  }
  console.log({
    openroadGal: gal,
    openroadAmt: amt,
    openroadPpgAmtGal: gal > 0 ? amt / gal : null,
    openroadAvgListedPpg: netN > 0 ? netSum / netN : null,
  });
} catch (e) {
  console.log('OpenRoad fuel_card error', e.message || e);
}
