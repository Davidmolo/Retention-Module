/**
 *   pnpm detention:compliance-scan
 */
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());

const { runDetentionComplianceScan } = await import(
  "../lib/detention/replyScan.ts"
);

const result = await runDetentionComplianceScan();
console.log(JSON.stringify(result, null, 2));
process.exit(0);
