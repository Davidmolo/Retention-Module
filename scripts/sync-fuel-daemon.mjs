// In-process alternative to system cron: runs the SFTP → DB fuel sync now and
// then every 30 minutes. Use this where no external scheduler is available
// (keep it alive with pm2/systemd/a container). Long-running; does not exit.
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());

const { syncFuelFromSftp } = await import('../lib/sftp/fuelSync.ts');

const INTERVAL_MS = Number(process.env.SFTP_SYNC_INTERVAL_MS || 30 * 60 * 1000);
let running = false;

async function runOnce() {
  if (running) {
    console.warn(`[${new Date().toISOString()}] previous sync still running; skipping`);
    return;
  }
  running = true;
  const startedAt = new Date().toISOString();
  try {
    const r = await syncFuelFromSftp();
    console.log(
      `[${startedAt}] fuel sync: remote=${r.remoteFiles} new=${r.newFiles} ` +
        `imported=${r.imported} transactions=${r.transactions} errors=${r.errors.length}`
    );
    for (const e of r.errors) console.error(`  ! ${e.file}: ${e.message}`);
  } catch (err) {
    console.error(`[${startedAt}] fuel sync failed:`, err.message);
  } finally {
    running = false;
  }
}

console.log(`fuel sync daemon started; interval ${INTERVAL_MS / 60000} min`);
await runOnce();
setInterval(runOnce, INTERVAL_MS);
