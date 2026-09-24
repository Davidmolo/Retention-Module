// Daily Prepass toll sync. Auths, fetches toll transactions for a rolling window
// (default last 14 days, to catch late-posted tolls), and upserts them by tollId.
// Self-terminating — meant for a daily scheduler.
//
// Cron example (daily at 03:00):
//   0 3 * * * cd /path/to/web && /usr/bin/env pnpm sync:tolls >> /var/log/toll-sync.log 2>&1
//
// Override the window: pnpm sync:tolls 2026-06-23 2026-06-29
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());

const { syncTolls } = await import('../lib/prepass/sync.ts');

const fmt = (d) => d.toISOString().slice(0, 10);
const [, , argStart, argEnd] = process.argv;

let start, end;
if (argStart && argEnd) {
  start = argStart;
  end = argEnd;
} else {
  const lookback = Number(process.env.PREPASS_LOOKBACK_DAYS || 14);
  const today = new Date();
  end = fmt(today);
  const from = new Date(today);
  from.setUTCDate(from.getUTCDate() - lookback);
  start = fmt(from);
}

const startedAt = new Date().toISOString();
try {
  const r = await syncTolls({ start, end });
  console.log(
    `[${startedAt}] toll sync ${r.start}..${r.end}: fetched=${r.fetched} stored=${r.stored} linked=${r.linked}`
  );
  process.exit(0);
} catch (err) {
  console.error(`[${startedAt}] toll sync failed:`, err.message);
  process.exit(1);
}
