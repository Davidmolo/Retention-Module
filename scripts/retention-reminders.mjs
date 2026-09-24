// Survey reminders for unanswered sends (default: after 3 days, max 2).
// After max reminders + another 3-day wait, marks occurrence as non_response.
//   pnpm retention:reminders
// Cron: 0 10 * * * cd /path && pnpm retention:reminders >> /var/log/retention-reminders.log 2>&1
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());

const { runSurveyReminders } = await import('../lib/retention/schedule.ts');

const startedAt = new Date().toISOString();
try {
  const out = await runSurveyReminders();
  console.log(
    `[${startedAt}] retention reminders reminded=${out.reminded} closed=${out.closed} skipped=${out.skipped}`
  );
  process.exit(0);
} catch (err) {
  console.error(`[${startedAt}] retention:reminders failed:`, err.message);
  process.exit(1);
}
