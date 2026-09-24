// Daily Retention occasion sends: birthday / anniversary / holiday wish + survey.
//   pnpm retention:occasions
// Cron example (every day 08:00 America/Chicago):
//   0 8 * * * cd /path/to/web && /usr/bin/env pnpm retention:occasions >> /var/log/retention-occasions.log 2>&1
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());

const { runDailyOccasionSends } = await import(
  '../lib/retention/occasionSends.ts'
);

const startedAt = new Date().toISOString();
try {
  const out = await runDailyOccasionSends();
  const sent = out.results.filter((r) => !r.skipped);
  const skipped = out.results.filter((r) => r.skipped);
  console.log(
    `[${startedAt}] occasions date=${out.date} holidays=${out.holidays.join(',') || 'none'} sent=${sent.length} skipped=${skipped.length}`
  );
  for (const r of sent) {
    console.log(
      `  SENT ${r.occasionType} ${r.occasionKey} driver=${r.driverId} ${r.name}`
    );
  }
  for (const r of skipped.slice(0, 20)) {
    console.log(
      `  SKIP ${r.occasionType} driver=${r.driverId} reason=${r.skipped}`
    );
  }
  process.exit(0);
} catch (err) {
  console.error(`[${startedAt}] retention:occasions failed:`, err.message);
  process.exit(1);
}
