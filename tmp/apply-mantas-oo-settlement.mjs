import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
import { syncRelayFuelForWeek } from "../lib/relay/syncFuel.ts";
import { allocateRouteRevenueForLoads } from "../lib/openroad/driverRoutes.ts";
import { storeWeeklySummary, getWeeklySummary } from "../lib/sources/weeklySummary.ts";
import { ooFuelMode } from "../lib/sources/driverTypeGroups.ts";

console.log("1) allocate route revenue for W45 team loads…");
await allocateRouteRevenueForLoads([2391896, 2394301, 2391342]);

console.log("2) sync Relay W45…");
const relay = await syncRelayFuelForWeek(2026, 45);
console.log(relay);

console.log("3) store W45…");
const stored = await storeWeeklySummary(2026, 45);
console.log(stored);

const live = await getWeeklySummary(2026, 45);
const want = [
  [/donald\s+smith/i, { lh: 6232.43, mi: 2360, label: "D.Smith" }],
  [/manpreet/i, { fee: 72.7, label: "Singh" }],
  [/malisa/i, { lh: 8910, label: "Malisa" }],
  [/cheryl\s+day/i, { lh: 8242.71, mi: 2463.3, label: "Day" }],
  [/prospere/i, { lh: 4600, mi: 1628.4, label: "Prospere" }],
];
for (const [re, t] of want) {
  const d = live.drivers.find((x) => re.test(x.name));
  if (!d) {
    console.log(t.label, "MISSING");
    continue;
  }
  console.log(
    JSON.stringify({
      label: t.label,
      name: d.name,
      mode: ooFuelMode(d.name),
      mi: d.mileage,
      lh: d.grossIncome,
      fuel: d.fuel,
      target: t,
    })
  );
}
process.exit(0);
