/**
 * Art’s detention follow-up digests only (per dispatcher + AR).
 *   pnpm detention:followups
 */
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const { runDetentionFollowUpDigests } = await import(
  "../lib/detention/followUpDigests.ts"
);

const result = await runDetentionFollowUpDigests();
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
