// Scheduled job: refresh source data from APIs, then compute + STORE the weekly
// Gross Profit report in gross_profit_reports. The app serves the stored report
// — it is not computed at runtime.
//   pnpm generate:report                 # previous week
//   pnpm generate:report 2026 30         # a specific week
//   pnpm generate:report 2026 28 2026 32 # a range of weeks (inclusive)
//
// Before each week is stored (Phase A — prepareReportWeek):
//   1) OpenRoad compensations (pay rates)
//   2) OpenRoad loads (full catalog; skip with GENERATE_REPORT_SKIP_LOADS_SYNC=1)
//   3) OpenRoad driver_routes for this week + previous week (driver_count refresh)
//   4) OpenRoad load_financials → driver_accessorials for pay
//   5) Link unlinked .dat fuel rows → PPG
//   6) Relay Fuel API → OO retail / paid week totals
//   7) Samsara MPG for the week
// Then Phase B: storeWeeklySummary (sheet-learned trip + pay rules).
//
// Cron example (weekly, Tuesday 06:00):
//   0 6 * * 2 cd /path/to/web && /usr/bin/env pnpm generate:report >> /var/log/gp-report.log 2>&1
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());

const { storeWeeklySummary } = await import('../lib/sources/weeklySummary.ts');
const { prepareReportWeek } = await import('../lib/jobs/prepareReportWeek.ts');
const { weekOf } = await import('../lib/week.ts');

const args = process.argv.slice(2).map(Number);
let weeks = [];
if (args.length >= 4) {
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
      `[${startedAt}] Phase A — prepare sources for W${week} ${year}…`
    );
    await prepareReportWeek(year, week);

    console.log(
      `[${startedAt}] Phase B — store weekly summary W${week} ${year}…`
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
