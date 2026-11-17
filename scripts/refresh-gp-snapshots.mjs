// After daily TMS/fuel sync: rewrite the GP table for the last 7 weeks
// (same window as Running balance). A saved week was staying frozen once it
// was older than "current + previous", so a termination or a late settlement
// never reached the site. Loads were just synced by daily-tms; skip that
// full catalog pull on every week.
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());
process.env.GENERATE_REPORT_SKIP_LOADS_SYNC = '1';

const { refreshGpWeekFromLive } = await import('../lib/sources/ensureGpWeek.ts');
const { weekOf, weekRange } = await import('../lib/week.ts');

const WEEKS = 7;

function previousWeek(year, week) {
  const { start } = weekRange(year, week);
  const d = new Date(`${start}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 7);
  return weekOf(d);
}

const current = weekOf(new Date());
const weeks = [];
let cursor = current;
for (let i = 0; i < WEEKS; i++) {
  weeks.push(cursor);
  cursor = previousWeek(cursor.year, cursor.week);
}
weeks.reverse();

const startedAt = new Date().toISOString();
let failed = 0;
for (const { year, week } of weeks) {
  try {
    console.log(`[${startedAt}] live→DB GP W${week} ${year}…`);
    const r = await refreshGpWeekFromLive(year, week);
    console.log(
      `[${startedAt}] stored W${r.week} ${r.year}: ${r.drivers} drivers`
    );
  } catch (err) {
    failed += 1;
    console.error(
      `[${startedAt}] refresh-gp-snapshots W${week} ${year} failed:`,
      err.message
    );
  }
}
process.exit(failed ? 1 : 0);
