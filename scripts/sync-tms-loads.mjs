// Daily OpenRoad TMS loads sync (freight hauls → per-driver miles & revenue).
// Upserts every load by id into `loads`. Run AFTER sync:tms-drivers (FK target).
// Self-terminating.
//
// Cron example (daily at 04:20, after drivers):
//   20 4 * * * cd /path/to/web && /usr/bin/env pnpm sync:tms-loads >> /var/log/tms-loads-sync.log 2>&1
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());

const { syncTmsLoads } = await import('../lib/openroad/loads.ts');

const startedAt = new Date().toISOString();
try {
  const r = await syncTmsLoads();
  console.log(
    `[${startedAt}] tms loads sync: pages=${r.pages} fetched=${r.fetched} stored=${r.stored} skipped=${r.skipped}`
  );
  process.exit(0);
} catch (err) {
  console.error(`[${startedAt}] tms loads sync failed:`, err.message);
  process.exit(1);
}
