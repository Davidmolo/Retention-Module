import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const { fetchOpenRoadJson } = await import("../lib/openroad/client.ts");
const base = "https://app.openroadtms.com/api/ext/v1/driver_pay_statements";
const urls = [
  `${base}?per_page=1`,
  `${base}?per_page=5&locked=true`,
  `${base}?per_page=5&locked=false`,
  `${base}?per_page=5&period_start[gte]=2025-01-01&sort=-period_start`,
  `${base}/23274_2026-10-13`,
];
for (const url of urls) {
  try {
    const json = await fetchOpenRoadJson(url);
    const rows = Array.isArray(json?.data) ? json.data : json?.data ? [json.data] : [];
    console.log("OK", url.replace(base, ""), "total", json?.meta?.total ?? "n/a", "rows", rows.length);
  } catch (e) {
    console.log("FAIL", url.replace(base, ""), e.message.slice(0, 180));
  }
}
