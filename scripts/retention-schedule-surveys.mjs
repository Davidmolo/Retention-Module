// Daily Retention survey cadence (2-week / monthly).
//   pnpm retention:schedule-surveys
// Cron: 0 9 * * * cd /path && pnpm retention:schedule-surveys >> /var/log/retention-surveys.log 2>&1
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());

const { runScheduledSurveys } = await import('../lib/retention/schedule.ts');

const startedAt = new Date().toISOString();
try {
  const out = await runScheduledSurveys();
  console.log(
    `[${startedAt}] retention schedule-surveys sent=${out.sent} skipped=${out.skipped}`
  );
  for (const r of out.results.filter((x) => x.action === 'sent')) {
    console.log(`  SENT driver=${r.driverId} ${r.name} ${r.surveyUrl}`);
  }
  process.exit(0);
} catch (err) {
  console.error(`[${startedAt}] retention:schedule-surveys failed:`, err.message);
  process.exit(1);
}
