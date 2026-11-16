import nextEnv from '@next/env';
import mysql from 'mysql2/promise';

nextEnv.loadEnvConfig(process.cwd());

const { storeWeeklySummary } = await import('../lib/sources/weeklySummary.ts');

const p = await mysql.createPool(process.env.DATABASE_URL);
const [weeks] = await p.query(
  `SELECT year, week, COUNT(*) AS drivers
     FROM gross_profit_reports
    GROUP BY year, week
    ORDER BY year, week`
);
console.log('Weeks to rebuild:', weeks.length);
for (const w of weeks) {
  console.log(`  ${w.year} W${w.week}: ${w.drivers} drivers (current)`);
}
await p.end();

const started = Date.now();
const results = [];
for (const w of weeks) {
  const year = Number(w.year);
  const week = Number(w.week);
  process.stdout.write(`Rebuilding ${year} W${week}… `);
  try {
    const r = await storeWeeklySummary(year, week);
    console.log(`ok ${r.drivers} drivers`);
    results.push({ year, week, drivers: r.drivers, ok: true });
  } catch (e) {
    console.log(`FAIL ${(e && e.message) || e}`);
    results.push({ year, week, ok: false, error: String(e && e.message ? e.message : e) });
  }
}

console.log('\n=== DONE ===');
console.log(
  JSON.stringify(
    {
      elapsedSec: Math.round((Date.now() - started) / 1000),
      ok: results.filter((r) => r.ok).length,
      fail: results.filter((r) => !r.ok).length,
      results,
    },
    null,
    2
  )
);
process.exit(results.some((r) => !r.ok) ? 1 : 0);
