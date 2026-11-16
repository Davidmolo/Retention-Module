import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());

const { syncLoadFinancialsForWeek } = await import('../lib/openroad/loadFinancials.ts');
const { storeWeeklySummary } = await import('../lib/sources/weeklySummary.ts');

for (const week of [42, 43]) {
  console.log(`financials W${week}`);
  const fin = await syncLoadFinancialsForWeek(2026, week);
  console.log(`financials W${week}`, JSON.stringify(fin));
  console.log(`store W${week}`);
  const stored = await storeWeeklySummary(2026, week);
  console.log(`stored W${week}`, JSON.stringify(stored));
}
process.exit(0);
