/**
 * Finish GP module DB refresh: retry failed weeks, then verify freshness.
 * Sources already pulled for most weeks; W43–44 need full prepare again.
 */
import fs from 'fs';
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());

const YEAR = 2026;

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function withRetry(label, fn, tries = 4) {
  let last;
  for (let i = 1; i <= tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      console.log(`${label} try ${i}/${tries} failed: ${e.message}`);
      if (i < tries) await sleep(3000 * i);
    }
  }
  throw last;
}

const out = {
  startedAt: new Date().toISOString(),
  prepass: null,
  storeOnly: [],
  full: [],
  verify: null,
  errors: [],
};

// PrePass retry
try {
  const { syncTolls, linkTollsToTrucks } = await import(
    '../lib/prepass/sync.ts'
  );
  out.prepass = await withRetry('prepass', () =>
    syncTolls({ start: '2026-08-20', end: '2026-10-31' })
  );
  out.prepass.linked = await linkTollsToTrucks();
  console.log('PrePass OK', out.prepass);
} catch (e) {
  out.prepass = { error: e.message };
  out.errors.push(`prepass: ${e.message}`);
  console.log('PrePass still failing — keeping existing toll_transactions');
}

process.env.GENERATE_REPORT_SKIP_LOADS_SYNC = '1';
const { prepareReportWeek } = await import('../lib/jobs/prepareReportWeek.ts');
const { storeWeeklySummary } = await import(
  '../lib/sources/weeklySummary.ts'
);

// Weeks where sources synced but store failed
for (const week of [37, 39, 40, 42]) {
  try {
    console.log(`\nstore-only W${week}`);
    const r = await withRetry(`store W${week}`, () =>
      storeWeeklySummary(YEAR, week)
    );
    out.storeOnly.push({ week, drivers: r.drivers });
    console.log('stored', r.drivers);
  } catch (e) {
    out.errors.push(`store W${week}: ${e.message}`);
  }
}

// Full prepare+store for weeks that never completed
for (const week of [43, 44]) {
  try {
    console.log(`\nfull W${week}`);
    const prep = await withRetry(`prepare W${week}`, () =>
      prepareReportWeek(YEAR, week)
    );
    const r = await withRetry(`store W${week}`, () =>
      storeWeeklySummary(YEAR, week)
    );
    out.full.push({
      week,
      drivers: r.drivers,
      relay: prep.steps?.relayFuel,
      orFuel: prep.steps?.openroadFuel,
      lf: prep.steps?.loadFinancials,
    });
    console.log('stored', r.drivers);
  } catch (e) {
    out.errors.push(`full W${week}: ${e.message}`);
  }
}

// Also re-store 36,38,41 so PPG/fuel use latest OR after any late fuel sync
for (const week of [36, 38, 41]) {
  try {
    console.log(`\nre-store W${week}`);
    const r = await withRetry(`store W${week}`, () =>
      storeWeeklySummary(YEAR, week)
    );
    out.storeOnly.push({ week, drivers: r.drivers, note: 'refresh' });
  } catch (e) {
    out.errors.push(`re-store W${week}: ${e.message}`);
  }
}

// Verify freshness across all weeks + Chambers W43
try {
  const mysql = (await import('mysql2/promise')).default;
  const p = await mysql.createConnection(process.env.DATABASE_URL);

  const [weeks] = await p.query(
    `SELECT week, COUNT(*) n,
            MAX(generated_at) generated_at
       FROM gross_profit_reports
      WHERE year=2026 AND week BETWEEN 36 AND 44
      GROUP BY week ORDER BY week`
  );

  const [ch] = await p.query(
    `SELECT fuel_ppg, fuel, mileage, gross_income, drivers_pay, prepass
       FROM gross_profit_reports
      WHERE year=2026 AND week=43 AND driver_id=24215`
  );
  const [orf] = await p.query(
    `SELECT diesel_gallons, diesel_net, synced_at
       FROM openroad_fuel_week_totals
      WHERE year=2026 AND week=43 AND driver_id=24215`
  );
  const [rf] = await p.query(
    `SELECT amount_paid, gallons, synced_at
       FROM relay_fuel_week_totals
      WHERE year=2026 AND week=43 AND driver_id=24215`
  );
  const [orfCount] = await p.query(
    `SELECT week, COUNT(*) drivers FROM openroad_fuel_week_totals
      WHERE year=2026 AND week BETWEEN 36 AND 44 GROUP BY week ORDER BY week`
  );
  const [rfCount] = await p.query(
    `SELECT week, COUNT(*) drivers FROM relay_fuel_week_totals
      WHERE year=2026 AND week BETWEEN 36 AND 44 GROUP BY week ORDER BY week`
  );

  const orPpg =
    orf[0] && Number(orf[0].diesel_gallons) > 0
      ? Number(orf[0].diesel_net) / Number(orf[0].diesel_gallons)
      : null;

  out.verify = {
    reportWeeks: weeks,
    openroadFuelWeeks: orfCount,
    relayFuelWeeks: rfCount,
    chambersW43: {
      gp: ch[0]
        ? {
            ppg: Number(ch[0].fuel_ppg),
            gross: Number(ch[0].gross_income),
            pay: Number(ch[0].drivers_pay),
            prepass: Number(ch[0].prepass),
            mi: Number(ch[0].mileage),
          }
        : null,
      orFuel: orf[0]
        ? {
            gal: Number(orf[0].diesel_gallons),
            ppg: orPpg,
            synced_at: orf[0].synced_at,
          }
        : null,
      relay: rf[0]
        ? {
            gal: Number(rf[0].gallons),
            paid: Number(rf[0].amount_paid),
            synced_at: rf[0].synced_at,
          }
        : null,
      gpMatchesOrPpg:
        ch[0] && orPpg != null
          ? Math.abs(Number(ch[0].fuel_ppg) - orPpg) < 0.01
          : false,
    },
  };
  await p.end();
  console.log('\nVERIFY', JSON.stringify(out.verify, null, 2));
} catch (e) {
  out.errors.push(`verify: ${e.message}`);
  console.log('verify failed', e.message);
}

out.finishedAt = new Date().toISOString();
fs.writeFileSync('tmp/finish-gp-rebuild.json', JSON.stringify(out, null, 2));
console.log('\nDONE errors=', out.errors.length);
if (out.errors.length) process.exitCode = 1;
