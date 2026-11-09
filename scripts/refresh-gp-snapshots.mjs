// After daily TMS/fuel sync: pull live sources + store GP for current and
// previous week so the DB stays the source of truth.
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());

const { refreshGpWeekFromLive } = await import('../lib/sources/ensureGpWeek.ts');
const { weekOf } = await import('../lib/week.ts');

const now = new Date();
const current = weekOf(now);
const prevDate = new Date(now);
prevDate.setUTCDate(prevDate.getUTCDate() - 7);
const previous = weekOf(prevDate);

const weeks = [
  [previous.year, previous.week],
  [current.year, current.week],
];

const startedAt = new Date().toISOString();
try {
  for (const [year, week] of weeks) {
    console.log(`[${startedAt}] live→DB GP W${week} ${year}…`);
    const r = await refreshGpWeekFromLive(year, week);
    console.log(
      `[${startedAt}] stored W${r.week} ${r.year}: ${r.drivers} drivers`
    );
  }
  process.exit(0);
} catch (err) {
  console.error(`[${startedAt}] refresh-gp-snapshots failed:`, err.message);
  process.exit(1);
}
