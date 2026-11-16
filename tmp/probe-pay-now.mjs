import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const { fetchOpenRoadJson } = await import("../lib/openroad/client.ts");
const base = "https://app.openroadtms.com/api/ext/v1/driver_pay_statements";
const json = await fetchOpenRoadJson(`${base}?per_page=3&sort=-period_start`);
const rows = Array.isArray(json?.data) ? json.data : [];
console.log("total", json?.meta?.total, "rows", rows.length);
for (const r of rows) {
  console.log(JSON.stringify({
    id: r.id,
    driver_id: r.driver_id,
    start: r.period_start,
    end: r.period_end,
    locked: r.locked,
    miles: r.total_paid_miles,
    linehaul: r.linehaul,
    earnings: r.earnings,
    gross: r.gross,
    keys: Object.keys(r).join(","),
  }));
}
if (rows[0]?.id) {
  const one = await fetchOpenRoadJson(`${base}/${encodeURIComponent(rows[0].id)}`);
  const d = one?.data || {};
  console.log("DETAIL", d.id, "miles", d.total_paid_miles, "linehaul", d.linehaul, "earnings", d.earnings, "items", (d.line_items || []).length);
}
