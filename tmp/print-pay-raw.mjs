import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const { fetchOpenRoadJson } = await import("../lib/openroad/client.ts");
const base = "https://app.openroadtms.com/api/ext/v1/driver_pay_statements";

const list = await fetchOpenRoadJson(`${base}?per_page=5&sort=-period_start`);
console.log("LIST");
console.log(JSON.stringify(list, null, 2));

try {
  const show = await fetchOpenRoadJson(`${base}/23274_2026-10-13`);
  console.log("SHOW");
  console.log(JSON.stringify(show, null, 2));
} catch (e) {
  const msg = String(e.message || e);
  const i = msg.indexOf("{");
  console.log("SHOW");
  console.log(i >= 0 ? msg.slice(i) : msg);
}
