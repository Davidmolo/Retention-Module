// Daily OpenRoad TMS truck sync. Paginates the full trucks list and upserts every
// truck by id into the trucks table. Self-terminating — for a
// daily scheduler.
//
// Cron example (daily at 04:15):
//   15 4 * * * cd /path/to/web && /usr/bin/env pnpm sync:tms-trucks >> /var/log/tms-trucks-sync.log 2>&1
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());

const { syncTmsTrucks } = await import('../lib/openroad/trucks.ts');

const startedAt = new Date().toISOString();
try {
  const r = await syncTmsTrucks();
  console.log(
    `[${startedAt}] tms trucks sync: pages=${r.pages} fetched=${r.fetched} stored=${r.stored} skipped=${r.skipped}`
  );
  process.exit(0);
} catch (err) {
  console.error(`[${startedAt}] tms trucks sync failed:`, err.message);
  process.exit(1);
}
