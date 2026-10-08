/**
 * Run Detention Gmail intake once.
 *   pnpm detention:intake
 *   pnpm detention:intake -- --days=30
 */
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const daysArg = process.argv.find((a) => a.startsWith("--days="));
const lookbackDays = daysArg
  ? Number(daysArg.split("=")[1])
  : undefined;

const { runDetentionEmailIntake } = await import(
  "../lib/detention/intake.ts"
);

const result = await runDetentionEmailIntake({ lookbackDays });
console.log(JSON.stringify(result, null, 2));
// Soft-fail on transient Gmail quota/retries so cron keeps running.
const fatal =
  !result.mailbox ||
  result.details.some(
    (d) =>
      d.result === "error" &&
      String(d.detail || "").includes("not connected")
  );
process.exit(fatal ? 1 : 0);
