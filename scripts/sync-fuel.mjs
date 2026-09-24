// One-shot SFTP → DB fuel sync. Designed to be run by a scheduler (system cron,
// pm2, a container CronJob, etc). Self-terminating.
//
// Cron example (every 30 minutes):
//   */30 * * * * cd /path/to/web && /usr/bin/env pnpm sync:fuel >> /var/log/fuel-sync.log 2>&1
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());

const { syncFuelFromSftp } = await import('../lib/sftp/fuelSync.ts');

const startedAt = new Date().toISOString();
try {
  const r = await syncFuelFromSftp();
  console.log(
    `[${startedAt}] fuel sync: remote=${r.remoteFiles} new=${r.newFiles} ` +
      `imported=${r.imported} transactions=${r.transactions} errors=${r.errors.length}`
  );
  for (const e of r.errors) console.error(`  ! ${e.file}: ${e.message}`);
  process.exit(r.errors.length ? 1 : 0);
} catch (err) {
  console.error(`[${startedAt}] fuel sync failed:`, err.message);
  process.exit(1);
}
