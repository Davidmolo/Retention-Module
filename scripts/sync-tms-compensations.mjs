// Daily OpenRoad TMS compensation sync (driver pay structures). Upserts every
// compensation by id into `compensations`. Self-terminating — for a daily scheduler.
//
// Cron example (daily at 03:45, before drivers so drivers.compensation_id resolves):
//   45 3 * * * cd /path/to/web && /usr/bin/env pnpm sync:tms-compensations >> /var/log/tms-comp-sync.log 2>&1
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());

const { syncTmsCompensations } = await import('../lib/openroad/compensations.ts');

const startedAt = new Date().toISOString();
try {
  const r = await syncTmsCompensations();
  console.log(
    `[${startedAt}] tms compensations sync: pages=${r.pages} fetched=${r.fetched} stored=${r.stored} skipped=${r.skipped}`
  );
  process.exit(0);
} catch (err) {
  console.error(`[${startedAt}] tms compensations sync failed:`, err.message);
  process.exit(1);
}
