// Weekly Samsara MPG sync. Fetches per-vehicle and per-driver fuel efficiency for
// a week and upserts snapshots. Defaults to the previous completed week.
// Usage: pnpm sync:samsara-mpg [year week]
//
// Cron example (weekly, Tuesday 05:00, after the TMS syncs):
//   0 5 * * 2 cd /path/to/web && /usr/bin/env pnpm sync:samsara-mpg >> /var/log/samsara-mpg.log 2>&1
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());

const { syncSamsaraMpg } = await import('../lib/samsara/mpg.ts');
const { weekOf } = await import('../lib/week.ts');

const [, , argYear, argWeek] = process.argv;
let year, week;
if (argYear && argWeek) {
  year = Number(argYear);
  week = Number(argWeek);
} else {
  const prev = new Date();
  prev.setUTCDate(prev.getUTCDate() - 7);
  ({ year, week } = weekOf(prev));
}

const startedAt = new Date().toISOString();
try {
  const r = await syncSamsaraMpg(year, week);
  console.log(
    `[${startedAt}] samsara mpg W${r.week} ${r.year}: vehicles=${r.vehicles} (linked ${r.vehiclesLinked}) drivers=${r.drivers} (linked ${r.driversLinked})`
  );
  process.exit(0);
} catch (err) {
  console.error(`[${startedAt}] samsara mpg sync failed:`, err.message);
  process.exit(1);
}
