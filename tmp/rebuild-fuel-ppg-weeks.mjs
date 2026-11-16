import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());
const { syncOpenRoadFuelForWeek } = await import(
  '../lib/openroad/fuelCardTransactions.ts'
);
const { storeWeeklySummary } = await import('../lib/sources/weeklySummary.ts');

const year = 2026;
const weeks = [36, 37, 38, 39, 40, 41, 42, 43, 44];

for (const week of weeks) {
  console.log(`\n=== W${week} fuel sync ===`);
  const fuel = await syncOpenRoadFuelForWeek(year, week);
  console.log(
    `fuel: fetched=${fuel.fetched} matched=${fuel.matched} drivers=${fuel.drivers}`
  );
  console.log(`=== W${week} store ===`);
  const r = await storeWeeklySummary(year, week);
  console.log(`stored: ${r.drivers} drivers`);
}

const { getPool } = await import('../lib/db.ts');
const p = getPool();
const [g] = await p.query(
  `SELECT fuel_ppg, fuel, mileage, gross_income
     FROM gross_profit_reports
    WHERE year = 2026 AND week = 43 AND driver_id = 24215`
);
console.log('\nChambers W43 final', g);
await p.end();
