// Daily OpenRoad TMS assignment sync (driver ↔ truck relation). Upserts every
// assignment by id into `assignments`. Run AFTER sync:tms-drivers + sync:tms-trucks
// so the driver/truck FK targets exist. Self-terminating.
//
// Cron example (daily at 04:30, after drivers 04:00 + trucks 04:15):
//   30 4 * * * cd /path/to/web && /usr/bin/env pnpm sync:tms-assignments >> /var/log/tms-assignments-sync.log 2>&1
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());

const { syncTmsAssignments } = await import('../lib/openroad/assignments.ts');

const startedAt = new Date().toISOString();
try {
  const r = await syncTmsAssignments();
  console.log(
    `[${startedAt}] tms assignments sync: pages=${r.pages} fetched=${r.fetched} stored=${r.stored} skipped=${r.skipped}`
  );
  process.exit(0);
} catch (err) {
  console.error(`[${startedAt}] tms assignments sync failed:`, err.message);
  process.exit(1);
}
