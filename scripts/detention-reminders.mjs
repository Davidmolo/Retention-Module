/**
 * Daily Detention emails:
 *   1) Mantas — T-2 compliance digests
 *   2) Art — follow-up digests (per dispatcher + AR submitted)
 *   pnpm detention:reminders
 */
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const { runDetentionComplianceDigests, runDetentionWeeklySummary, runDetentionCustomerBilledWeekly } = await import(
  "../lib/detention/reminders.ts"
);
const { runDetentionFollowUpDigests } = await import(
  "../lib/detention/followUpDigests.ts"
);

const compliance = await runDetentionComplianceDigests();
console.log("[compliance]", JSON.stringify(compliance, null, 2));

const followUps = await runDetentionFollowUpDigests();
console.log("[followUps]", JSON.stringify(followUps, null, 2));

const weekly = await runDetentionWeeklySummary();
console.log("[weekly]", JSON.stringify(weekly, null, 2));

const customers = await runDetentionCustomerBilledWeekly();
console.log("[customers]", JSON.stringify(customers, null, 2));

const ok = compliance.ok && followUps.ok && weekly.ok && customers.ok;
process.exit(ok ? 0 : 1);
