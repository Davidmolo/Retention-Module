import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const { fetchOpenRoadJson } = await import("../lib/openroad/client.ts");
const base = "https://app.openroadtms.com/api/ext/v1";

const urls = [
  ["loads", `${base}/loads?per_page=1`],
  ["load-one", `${base}/loads/2358332`],
  ["load-financials", `${base}/load_financials/2358332`],
  ["load-gross-profit", `${base}/loads/2358332/gross_profit`],
  ["driver-routes", `${base}/driver_routes?per_page=1&load_id=2358332`],
  ["destinations", `${base}/destinations?per_page=1&load_id=2358332`],
  ["driver-stats", `${base}/driver_stats?per_page=1&driver_id=23274`],
  ["earnings", `${base}/driver_earnings_summaries?per_page=1&id=23274`],
  ["otd", `${base}/driver_otd_summaries?per_page=1&driver_id=23274&date[gte]=2026-10-13&date[lte]=2026-10-19`],
  ["compensations", `${base}/compensations?per_page=1`],
  ["fuel-cards", `${base}/fuel_card_transactions?per_page=1&date[gte]=2026-10-13&date[lte]=2026-10-19`],
  ["detentions", `${base}/detentions?per_page=1`],
  ["pay-statements", `${base}/driver_pay_statements?per_page=1`],
  ["payroll", `${base}/payroll_schedules?per_page=1`],
  ["users", `${base}/users?per_page=1`],
  ["drivers", `${base}/drivers/23274`],
];

for (const [label, url] of urls) {
  try {
    const json = await fetchOpenRoadJson(url);
    const data = json?.data;
    const row = Array.isArray(data) ? data[0] : data;
    const keys = row && typeof row === "object" ? Object.keys(row) : [];
    const money = {};
    for (const k of keys) {
      if (/mile|gross|linehaul|earn|pay|fuel|total|rate|profit|accessorial|detention|sum|fee|settlement|prepass|toll/i.test(k)) {
        const v = row[k];
        money[k] = Array.isArray(v) ? `list:${v.length}` : v;
      }
    }
    console.log(
      JSON.stringify({
        label,
        ok: true,
        total: json?.meta?.total ?? (row ? 1 : 0),
        keys,
        money,
      })
    );
  } catch (e) {
    const msg = String(e.message || e);
    const code = msg.match(/\b(\d{3})\b/)?.[1] || "error";
    console.log(JSON.stringify({ label, ok: false, status: code, message: msg.slice(0, 160) }));
  }
}
