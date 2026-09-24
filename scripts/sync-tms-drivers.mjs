// Daily OpenRoad TMS driver sync. Paginates the full drivers list and upserts
// every driver by id into the drivers table. Self-terminating — for a daily scheduler.
//
// Cron example (daily at 04:00):
//   0 4 * * * cd /path/to/web && /usr/bin/env pnpm sync:tms-drivers >> /var/log/tms-drivers-sync.log 2>&1
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());

const { syncTmsDrivers } = await import('../lib/openroad/sync.ts');

const startedAt = new Date().toISOString();
try {
  const r = await syncTmsDrivers();
  console.log(
    `[${startedAt}] tms drivers sync: pages=${r.pages} fetched=${r.fetched} stored=${r.stored} skipped=${r.skipped}`
  );
  process.exit(0);
} catch (err) {
  console.error(`[${startedAt}] tms drivers sync failed:`, err.message);
  process.exit(1);
}
