/**
 * Daily Detention follow-up reminder emails.
 *   pnpm detention:reminders
 */
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const { runDetentionDailyReminders } = await import(
  "../lib/detention/reminders.ts"
);

const result = await runDetentionDailyReminders();
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
