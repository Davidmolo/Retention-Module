import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());
const { fetchOpenRoadJson } = await import('../lib/openroad/client.ts');

const start = '2026-10-13';
const end = '2026-10-19';
const base =
  'https://app.openroadtms.com/api/ext/v1/fuel_card_transactions';

async function tryUrl(label, url) {
  try {
    const json = await fetchOpenRoadJson(url);
    const data = json?.data ?? json;
    const items = Array.isArray(data) ? data : data ? [data] : [];
    console.log(
      JSON.stringify({
        label,
        ok: true,
        n: items.length,
        meta: json?.meta ?? null,
        keys: items[0] ? Object.keys(items[0]) : [],
        sample: items[0] ?? null,
      })
    );
    return items;
  } catch (e) {
    console.log(JSON.stringify({ label, ok: false, err: String(e.message || e).slice(0, 200) }));
    return [];
  }
}

await tryUrl('list-date', `${base}?per_page=5&date[gte]=${start}&date[lte]=${end}`);
await tryUrl('list-txn-date', `${base}?per_page=5&transaction_date[gte]=${start}&transaction_date[lte]=${end}`);
await tryUrl('list-plain', `${base}?per_page=5`);

// paginate looking for Chambers
let page = 1;
let found = [];
while (page <= 30) {
  try {
    const json = await fetchOpenRoadJson(
      `${base}?per_page=100&page=${page}&date[gte]=${start}&date[lte]=${end}`
    );
    const items = Array.isArray(json?.data) ? json.data : [];
    if (!items.length) break;
    for (const r of items) {
      const blob = JSON.stringify(r).toLowerCase();
      if (blob.includes('chambers') || blob.includes('24215')) found.push(r);
    }
    const last = json?.meta?.last_page;
    if (last != null && page >= last) break;
    if (items.length < 100) break;
    page += 1;
  } catch (e) {
    console.log('page fail', page, e.message);
    break;
  }
}
console.log('found chambers', found.length);
if (found[0]) console.log(JSON.stringify(found[0], null, 2));
if (found.length) {
  const keys = Object.keys(found[0]);
  console.log('keys', keys);
}
