// Scheduled job: compute the weekly Gross Profit report and STORE it in the DB
// (gross_profit_reports). The app serves the stored report — it is not computed
// at runtime. Defaults to the previous completed week.
//   pnpm generate:report                 # previous week
//   pnpm generate:report 2026 30         # a specific week
//   pnpm generate:report 2026 28 2026 32 # a range of weeks (inclusive)
//
// Before each week is stored:
//   1) OpenRoad /load_financials → driver_accessorials for pay
//   2) Link any unlinked .dat fuel rows → PPG (company + owner-operator)
//   3) Relay Fuel API → OO retail / paid week totals
//   4) Samsara MPG for the week → company fuel = miles/MPG × PPG
//
// Cron example (weekly, Tuesday 06:00, after all source syncs):
//   0 6 * * 2 cd /path/to/web && /usr/bin/env pnpm generate:report >> /var/log/gp-report.log 2>&1
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());

const { storeWeeklySummary } = await import('../lib/sources/weeklySummary.ts');
const { syncLoadFinancialsForWeek } = await import(
  '../lib/openroad/loadFinancials.ts'
);
const { linkFuelDrivers } = await import('../lib/dat/linkFuelDrivers.ts');
const { syncRelayFuelForWeek } = await import('../lib/relay/syncFuel.ts');
const { syncSamsaraMpg } = await import('../lib/samsara/mpg.ts');
const { weekOf } = await import('../lib/week.ts');

const args = process.argv.slice(2).map(Number);
let weeks = [];
if (args.length >= 4) {
  // range: fromYear fromWeek toYear toWeek (same-year range for simplicity)
  const [fy, fw, , tw] = args;
  for (let w = fw; w <= tw; w++) weeks.push([fy, w]);
} else if (args.length === 2) {
  weeks = [[args[0], args[1]]];
} else {
  const prev = new Date();
  prev.setUTCDate(prev.getUTCDate() - 7);
  const { year, week } = weekOf(prev);
  weeks = [[year, week]];
}

const startedAt = new Date().toISOString();
try {
  for (const [year, week] of weeks) {
    console.log(
      `[${startedAt}] syncing load_financials / driver_accessorials for W${week} ${year}…`
    );
    const lf = await syncLoadFinancialsForWeek(year, week);
    console.log(
      `[${startedAt}] load_financials W${week}: fetched=${lf.fetched} stored≈${lf.stored} accessorials≈${lf.accessorials} skipped=${lf.skipped}`
    );

    const fuelLink = await linkFuelDrivers();
    console.log(
      `[${startedAt}] fuel link: name=${fuelLink.nameLinked} unit=${fuelLink.unitLinked}`
    );

    if (process.env.RELAY_API_KEY) {
      const relay = await syncRelayFuelForWeek(year, week);
      console.log(
        `[${startedAt}] relay fuel W${week}: fetched=${relay.fetched} matched=${relay.matched} unmatched=${relay.unmatched} drivers=${relay.drivers}`
      );
    } else {
      console.log(
        `[${startedAt}] relay fuel W${week}: skipped (RELAY_API_KEY not set)`
      );
    }

    const mpg = await syncSamsaraMpg(year, week);
    console.log(
      `[${startedAt}] samsara MPG W${week}: vehicles=${mpg.vehicles} drivers=${mpg.drivers} vehLinked=${mpg.vehiclesLinked} drvLinked=${mpg.driversLinked}`
    );

    const r = await storeWeeklySummary(year, week);
    console.log(
      `[${startedAt}] stored gross profit report W${r.week} ${r.year}: ${r.drivers} drivers`
    );
  }
  process.exit(0);
} catch (err) {
  console.error(`[${startedAt}] generate:report failed:`, err.message);
  process.exit(1);
}
