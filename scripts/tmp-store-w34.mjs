import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const { storeWeeklySummary } = await import("../lib/sources/weeklySummary.ts");
const r = await storeWeeklySummary(2026, 34);
console.log(`stored W${r.week} ${r.year}: ${r.drivers} drivers`);
