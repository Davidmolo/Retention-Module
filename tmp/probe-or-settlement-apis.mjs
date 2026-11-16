import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
import { fetchOpenRoadJson } from "../lib/openroad/client.ts";
import { weekRange } from "../lib/week.ts";

const BASE = "https://app.openroadtms.com/api/ext/v1";
const { start, end } = weekRange(2026, 44);

async function tryGet(path, label) {
  try {
    const j = await fetchOpenRoadJson(`${BASE}${path}`);
    const d = j?.data ?? j;
    console.log("\nOK", label || path);
    if (Array.isArray(d)) {
      console.log("  count", d.length);
      if (d[0]) console.log("  sample keys", Object.keys(d[0]).slice(0, 40));
      console.log("  sample", JSON.stringify(d[0] ?? null, null, 2).slice(0, 1200));
    } else {
      console.log("  keys", Object.keys(d || {}).slice(0, 50));
      console.log("  body", JSON.stringify(d, null, 2).slice(0, 2000));
    }
    return d;
  } catch (e) {
    console.log("\nFAIL", label || path, e.message.slice(0, 200));
    return null;
  }
}

// Elias team load from earlier
const LOAD = 2355803; // 2610-00478
const ELIAS = 39422;
const ROBERSON = 37886;

await tryGet(`/loads/${LOAD}/gross_profit`, "load gross_profit");
await tryGet(`/load_financials/${LOAD}`, "load_financials");
await tryGet(`/loads/${LOAD}`, "load");

// driver routes for this load
const routes = await tryGet(
  `/driver_routes?load_id=${LOAD}&per_page=50`,
  "driver_routes by load_id"
);

// pay statements W44
const stmts = await tryGet(
  `/driver_pay_statements?page=1&per_page=50`,
  "driver_pay_statements page1"
);
// try filter by driver
await tryGet(
  `/driver_pay_statements?driver_id=${ELIAS}&per_page=20`,
  "pay statements Elias"
);
await tryGet(
  `/driver_earnings_summaries?driver_id=${ELIAS}&per_page=20`,
  "earnings summaries Elias"
);
await tryGet(
  `/driver_earnings_summaries?per_page=5`,
  "earnings summaries sample"
);

await tryGet(
  `/fuel_card_transactions?driver_id=${ROBERSON}&date[gte]=${start}&date[lte]=${end}&per_page=20`,
  "fuel Roberson filtered"
);

await tryGet(`/detentions?per_page=5`, "detentions sample");

// Search openapi for earnings / gross_profit schema fields
import fs from "fs";
const yaml = fs.readFileSync("tmp/or-openapi.yaml", "utf8");
for (const term of [
  "gross_profit",
  "driver_earnings",
  "driver_pay_statement",
  "linehaul",
  "settlement",
]) {
  const idx = yaml.toLowerCase().indexOf(term);
  console.log("\nYAML hit", term, idx);
}
// extract gross_profit path block
const m = yaml.match(/\/loads\/\{load_id\}\/gross_profit:[\s\S]*?(?=\n  \/|$)/);
if (m) console.log("\nGROSS_PROFIT PATH\n", m[0].slice(0, 2500));
const m2 = yaml.match(/\/driver_earnings_summaries:[\s\S]*?(?=\n  \/|$)/);
if (m2) console.log("\nEARNINGS PATH\n", m2[0].slice(0, 2500));
const m3 = yaml.match(/\/driver_pay_statements:[\s\S]*?(?=\n  \/driver_pay_statements\/\{id\}:|$)/);
if (m3) console.log("\nPAY STATEMENTS PATH\n", m3[0].slice(0, 3000));
