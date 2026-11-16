/**
 * Make GP DB current for ALL weeks 36–44:
 * 1) PrePass in ≤31-day chunks
 * 2) Relay + OpenRoad fuel per week
 * 3) load financials + routes via prepare (skip full loads)
 * 4) storeWeeklySummary every week
 */
import fs from 'fs';
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());

const YEAR = 2026;
const WEEKS = [36, 37, 38, 39, 40, 41, 42, 43, 44];

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function withRetry(label, fn, tries = 5) {
  let last;
  for (let i = 1; i <= tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      console.log(`${label} try ${i}/${tries}: ${e.message}`);
      await sleep(4000 * i);
    }
  }
  throw last;
}

const out = { startedAt: new Date().toISOString(), steps: [], errors: [] };

// PrePass chunks (API max 31 days)
try {
  const { syncTolls, linkTollsToTrucks } = await import(
    '../lib/prepass/sync.ts'
  );
  const ranges = [
    ['2026-08-20', '2026-09-19'],
    ['2026-09-20', '2026-10-19'],
    ['2026-10-20', '2026-10-31'],
  ];
  for (const [start, end] of ranges) {
    const r = await withRetry(`prepass ${start}..${end}`, () =>
      syncTolls({ start, end })
    );
    console.log('PrePass', start, end, r);
    out.steps.push({ prepass: { start, end, ...r } });
  }
  const linked = await linkTollsToTrucks();
  out.steps.push({ prepassLinked: linked });
  console.log('tolls linked', linked);
} catch (e) {
  out.errors.push(`prepass: ${e.message}`);
}

process.env.GENERATE_REPORT_SKIP_LOADS_SYNC = '1';
// Skip PrePass inside prepare to avoid double-fetch / DNS noise this run —
// we already chunked it above. prepareReportWeek now calls PrePass; if it
// fails it continues. Fine.

const { prepareReportWeek } = await import('../lib/jobs/prepareReportWeek.ts');
const { storeWeeklySummary } = await import(
  '../lib/sources/weeklySummary.ts'
);

for (const week of WEEKS) {
  try {
    console.log(`\n======== W${week} ========`);
    const prep = await withRetry(`prepare W${week}`, () =>
      prepareReportWeek(YEAR, week)
    );
    const store = await withRetry(`store W${week}`, () =>
      storeWeeklySummary(YEAR, week)
    );
    out.steps.push({
      week,
      drivers: store.drivers,
      relayDrivers: prep.steps?.relayFuel?.drivers ?? null,
      orFuelDrivers: prep.steps?.openroadFuel?.drivers ?? null,
      prepass: prep.steps?.prepass ?? null,
      lf: prep.steps?.loadFinancials?.stored ?? null,
    });
    console.log('OK W' + week, 'drivers', store.drivers);
  } catch (e) {
    out.errors.push(`W${week}: ${e.message}`);
    console.log('FAIL W' + week, e.message);
  }
}

// Final verify
try {
  const mysql = (await import('mysql2/promise')).default;
  const p = await mysql.createConnection(process.env.DATABASE_URL);
  const [weeks] = await p.query(
    `SELECT week, COUNT(*) n, MAX(generated_at) generated_at
       FROM gross_profit_reports
      WHERE year=2026 AND week BETWEEN 36 AND 44
      GROUP BY week ORDER BY week`
  );
  const [ch] = await p.query(
    `SELECT fuel_ppg, gross_income, drivers_pay, prepass, mileage
       FROM gross_profit_reports WHERE year=2026 AND week=43 AND driver_id=24215`
  );
  const [orf] = await p.query(
    `SELECT diesel_gallons, diesel_net, synced_at FROM openroad_fuel_week_totals
      WHERE year=2026 AND week=43 AND driver_id=24215`
  );
  out.verify = {
    weeks,
    chambers: {
      gpPpg: ch[0] ? Number(ch[0].fuel_ppg) : null,
      orPpg:
        orf[0] && Number(orf[0].diesel_gallons) > 0
          ? Number(orf[0].diesel_net) / Number(orf[0].diesel_gallons)
          : null,
      orSynced: orf[0]?.synced_at ?? null,
      gp: ch[0]
        ? {
            gross: Number(ch[0].gross_income),
            pay: Number(ch[0].drivers_pay),
            prepass: Number(ch[0].prepass),
            mi: Number(ch[0].mileage),
          }
        : null,
    },
  };
  await p.end();
  console.log('VERIFY', JSON.stringify(out.verify, null, 2));
} catch (e) {
  out.errors.push(`verify: ${e.message}`);
}

out.finishedAt = new Date().toISOString();
fs.writeFileSync('tmp/resync-fuel-all-weeks.json', JSON.stringify(out, null, 2));
console.log('DONE errors=', out.errors.length);
if (out.errors.length) process.exitCode = 1;
