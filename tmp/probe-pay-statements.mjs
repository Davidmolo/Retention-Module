import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const { fetchOpenRoadJson } = await import("../lib/openroad/client.ts");

const base = "https://app.openroadtms.com/api/ext/v1/driver_pay_statements";
const urls = [
  `${base}?per_page=5&sort=-period_start`,
  `${base}?per_page=5&period_start[gte]=2026-10-01&period_start[lte]=2026-10-31&sort=period_start`,
  `${base}?per_page=2&driver_id=37820&sort=-period_start`,
  `${base}?per_page=2&driver_id=23274&period_start[gte]=2026-10-01&period_start[lte]=2026-10-26`,
];
for (const url of urls) {
  try {
    const json = await fetchOpenRoadJson(url);
    const rows = Array.isArray(json?.data) ? json.data : [];
    console.log("\nURL", url.split("?")[1]);
    console.log("meta", JSON.stringify(json?.meta || null));
    console.log("rows", rows.length);
    for (const r of rows) {
      const keys = Object.keys(r);
      console.log(
        JSON.stringify({
          id: r.id,
          driver_id: r.driver_id,
          period_start: r.period_start,
          period_end: r.period_end,
          pay_type: r.pay_type,
          locked: r.locked,
          miles: r.total_paid_miles,
          linehaul: r.linehaul,
          earnings: r.earnings,
          gross: r.gross,
          keys: keys.join(","),
        })
      );
    }
  } catch (e) {
    console.log("\nFAIL", url.split("?")[1], e.message.slice(0, 220));
  }
}
