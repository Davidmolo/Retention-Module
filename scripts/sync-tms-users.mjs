// Daily OpenRoad TMS users sync (dispatchers / managers).
//   pnpm sync:tms-users
// Cron example (daily after drivers sync):
//   15 4 * * * cd /path/to/web && /usr/bin/env pnpm sync:tms-users >> /var/log/tms-users-sync.log 2>&1
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());

const { syncTmsUsers } = await import('../lib/openroad/users.ts');

const startedAt = new Date().toISOString();
try {
  const r = await syncTmsUsers();
  console.log(
    `[${startedAt}] tms users sync: pages=${r.pages} fetched=${r.fetched} stored=${r.stored} skipped=${r.skipped}`
  );
  process.exit(0);
} catch (err) {
  console.error(`[${startedAt}] tms users sync failed:`, err.message);
  process.exit(1);
}
