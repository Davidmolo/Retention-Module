// OpenRoad TMS driver_routes sync. Upserts routes by id into `driver_routes`.
// Defaults to the previous completed Tuesday→Monday week (same as samsara mpg).
// Full history: omit year/week and pass --all
//
// Usage:
//   bun run sync:tms-driver-routes              # previous week
//   bun run sync:tms-driver-routes 2026 37      # specific week
//   bun run sync:tms-driver-routes --all        # full paginated sync
//
// Cron example (daily at 04:25, after loads):
//   25 4 * * * cd /app && bun run sync:tms-driver-routes >> /app/logs/tms-driver-routes-sync.log 2>&1
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());

const { syncTmsDriverRoutes, previousWeek } = await import(
  '../lib/openroad/driverRoutes.ts'
);

const args = process.argv.slice(2);
const startedAt = new Date().toISOString();

try {
  let year;
  let week;
  if (args[0] === '--all') {
    year = undefined;
    week = undefined;
  } else if (args[0] && args[1]) {
    year = Number(args[0]);
    week = Number(args[1]);
  } else {
    ({ year, week } = previousWeek());
  }

  const r = await syncTmsDriverRoutes(year, week);
  const scope =
    r.year != null && r.week != null ? `W${r.week} ${r.year}` : 'all';
  console.log(
    `[${startedAt}] tms driver_routes sync (${scope}): pages=${r.pages} fetched=${r.fetched} stored=${r.stored} skipped=${r.skipped}`
  );
  process.exit(0);
} catch (err) {
  console.error(`[${startedAt}] tms driver_routes sync failed:`, err.message);
  process.exit(1);
}
