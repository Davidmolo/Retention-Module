/**
 * Refresh ALL GP-related source tables from live APIs, then rebuild
 * gross_profit_reports for weeks 36–44 so the app DB is not stale.
 */
import fs from 'fs';
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());

const YEAR = 2026;
const WEEKS = [36, 37, 38, 39, 40, 41, 42, 43, 44];

function log(...a) {
  console.log(new Date().toISOString(), ...a);
}

const summary = {
  startedAt: new Date().toISOString(),
  prepass: null,
  loads: null,
  weeks: [],
  verifyW43: null,
  errors: [],
};

function withTimeout(promise, ms, label) {
  let t;
  const timeout = new Promise((_, rej) => {
    t = setTimeout(
      () => rej(new Error(`${label} timed out after ${ms}ms`)),
      ms
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

// --- PrePass (tolls) for full span ---
try {
  const { syncTolls, linkTollsToTrucks } = await import(
    '../lib/prepass/sync.ts'
  );
  log('PrePass sync 2026-08-20 .. 2026-10-31 …');
  summary.prepass = await withTimeout(
    syncTolls({ start: '2026-08-20', end: '2026-10-31' }),
    180000,
    'PrePass'
  );
  summary.prepass.linked = await linkTollsToTrucks();
  log('PrePass', summary.prepass);
} catch (e) {
  summary.prepass = { error: e.message };
  summary.errors.push(`prepass: ${e.message}`);
  log('PrePass FAILED (continuing with existing tolls)', e.message);
}

// --- Assignments (needed for PrePass → driver) ---
try {
  const { syncTmsAssignments } = await import('../lib/openroad/assignments.ts');
  log('OpenRoad assignments sync …');
  summary.assignments = await syncTmsAssignments();
  log('assignments', summary.assignments);
} catch (e) {
  summary.assignments = { error: e.message };
  summary.errors.push(`assignments: ${e.message}`);
  log('assignments FAILED', e.message);
}

// --- OpenRoad loads once (shared across weeks) ---
try {
  const { syncTmsLoads } = await import('../lib/openroad/loads.ts');
  log('OpenRoad loads sync …');
  summary.loads = await syncTmsLoads();
  log('loads', summary.loads);
} catch (e) {
  summary.loads = { error: e.message };
  summary.errors.push(`loads: ${e.message}`);
  log('loads FAILED', e.message);
}

process.env.GENERATE_REPORT_SKIP_LOADS_SYNC = '1';

const { prepareReportWeek } = await import('../lib/jobs/prepareReportWeek.ts');
const { storeWeeklySummary } = await import(
  '../lib/sources/weeklySummary.ts'
);

for (const week of WEEKS) {
  const w = { week, prepare: null, store: null, error: null };
  try {
    log(`\n===== W${week} prepare =====`);
    w.prepare = await prepareReportWeek(YEAR, week);
    log(`===== W${week} store =====`);
    w.store = await storeWeeklySummary(YEAR, week);
    log(`stored drivers=${w.store.drivers}`);
  } catch (e) {
    w.error = e.message;
    summary.errors.push(`W${week}: ${e.message}`);
    log(`W${week} FAILED`, e.message);
  }
  summary.weeks.push({
    week: w.week,
    error: w.error,
    drivers: w.store?.drivers ?? null,
    relay: w.prepare?.steps?.relayFuel ?? null,
    orFuel: w.prepare?.steps?.openroadFuel ?? null,
    lf: w.prepare?.steps?.loadFinancials ?? null,
    mpg: w.prepare?.steps?.samsaraMpg ?? null,
  });
}

// --- Verify Chambers W43 not stale vs live OpenRoad/Relay tables ---
try {
  const mysql = (await import('mysql2/promise')).default;
  const p = await mysql.createConnection(process.env.DATABASE_URL);
  const [gp] = await p.query(
    `SELECT fuel_ppg, fuel, mileage, gross_income, drivers_pay, prepass
       FROM gross_profit_reports
      WHERE year=2026 AND week=43 AND driver_id=24215`
  );
  const [orf] = await p.query(
    `SELECT diesel_gallons, diesel_net, txn_count, synced_at
       FROM openroad_fuel_week_totals
      WHERE year=2026 AND week=43 AND driver_id=24215`
  );
  const [rf] = await p.query(
    `SELECT amount_paid, gallons, txn_count, synced_at
       FROM relay_fuel_week_totals
      WHERE year=2026 AND week=43 AND driver_id=24215`
  );
  const or = orf[0];
  const orPpg =
    or && Number(or.diesel_gallons) > 0
      ? Number(or.diesel_net) / Number(or.diesel_gallons)
      : null;
  summary.verifyW43 = {
    chambersGp: gp[0]
      ? {
          ppg: Number(gp[0].fuel_ppg),
          fuel: Number(gp[0].fuel),
          mi: Number(gp[0].mileage),
          gross: Number(gp[0].gross_income),
          pay: Number(gp[0].drivers_pay),
          prepass: Number(gp[0].prepass),
        }
      : null,
    openroadFuel: or
      ? {
          gal: Number(or.diesel_gallons),
          net: Number(or.diesel_net),
          ppg: orPpg,
          synced_at: or.synced_at,
        }
      : null,
    relayFuel: rf[0]
      ? {
          paid: Number(rf[0].amount_paid),
          gal: Number(rf[0].gallons),
          txnPpg:
            rf[0].gallons && Number(rf[0].gallons) > 0
              ? Number(rf[0].amount_paid) / Number(rf[0].gallons)
              : null,
          synced_at: rf[0].synced_at,
        }
      : null,
    gpPpgMatchesOr:
      gp[0] && orPpg != null
        ? Math.abs(Number(gp[0].fuel_ppg) - orPpg) < 0.01
        : false,
  };
  await p.end();
  log('verify W43 Chambers', summary.verifyW43);
} catch (e) {
  summary.errors.push(`verify: ${e.message}`);
  log('verify FAILED', e.message);
}

summary.finishedAt = new Date().toISOString();
fs.writeFileSync(
  'tmp/refresh-all-gp-db.json',
  JSON.stringify(summary, null, 2)
);
log('WROTE tmp/refresh-all-gp-db.json errors=', summary.errors.length);
if (summary.errors.length) process.exitCode = 1;
