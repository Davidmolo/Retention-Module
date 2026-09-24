// Sync Relay TMS Fuel API → relay_fuel_week_totals for OO retail/paid.
// Usage:
//   pnpm sync:relay-fuel           # previous completed week
//   pnpm sync:relay-fuel 2026 35   # specific week
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());

const { syncRelayFuelForWeek } = await import('../lib/relay/syncFuel.ts');
const { weekOf } = await import('../lib/week.ts');

const args = process.argv.slice(2).map(Number);
let year;
let week;
if (args.length >= 2) {
  [year, week] = args;
} else {
  const prev = new Date();
  prev.setUTCDate(prev.getUTCDate() - 7);
  ({ year, week } = weekOf(prev));
}

const startedAt = new Date().toISOString();
try {
  const r = await syncRelayFuelForWeek(year, week);
  console.log(
    `[${startedAt}] relay fuel W${r.week} ${r.year} (${r.start}→${r.end}): ` +
      `fetched=${r.fetched} matched=${r.matched} unmatched=${r.unmatched} drivers=${r.drivers}`
  );
  process.exit(0);
} catch (err) {
  console.error(`[${startedAt}] sync:relay-fuel failed:`, err.message);
  process.exit(1);
}
