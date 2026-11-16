import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const { fetchOpenRoadJson } = await import("../lib/openroad/client.ts");

const urls = [
  "https://app.openroadtms.com/api/ext/v1/driver_pay_statements?per_page=1&period_start=2026-10-13",
  "https://app.openroadtms.com/api/ext/v1/driver_pay_statements/37820_2026-10-13",
  "https://app.openroadtms.com/api/ext/v1/loads?per_page=1",
];
for (const url of urls) {
  try {
    const json = await fetchOpenRoadJson(url);
    const n = Array.isArray(json?.data) ? json.data.length : json?.data ? 1 : 0;
    console.log("OK", url.split("ext/v1")[1], "rows", n);
  } catch (e) {
    console.log("FAIL", url.split("ext/v1")[1], e.message.slice(0, 180));
  }
}
