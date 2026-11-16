/** Store-only rebuild of gross_profit_reports for all GP weeks (uses DB sources). */
import fs from 'fs';
import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());

const YEAR = 2026;
const WEEKS = [36, 37, 38, 39, 40, 41, 42, 43, 44];
const { storeWeeklySummary } = await import('../lib/sources/weeklySummary.ts');

const out = { startedAt: new Date().toISOString(), weeks: [], errors: [] };

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

for (const week of WEEKS) {
  let ok = false;
  for (let attempt = 1; attempt <= 4 && !ok; attempt++) {
    try {
      console.log(`store W${week} attempt ${attempt}`);
      const r = await storeWeeklySummary(YEAR, week);
      out.weeks.push({ week, drivers: r.drivers, attempt });
      console.log(`W${week} ok drivers=${r.drivers}`);
      ok = true;
    } catch (e) {
      console.log(`W${week} fail attempt ${attempt}:`, e.message);
      if (attempt === 4) {
        out.errors.push(`W${week}: ${e.message}`);
        out.weeks.push({ week, error: e.message });
      } else {
        await sleep(3000 * attempt);
      }
    }
  }
}

// quick verify Chambers W43
try {
  const mysql = (await import('mysql2/promise')).default;
  const p = await mysql.createConnection(process.env.DATABASE_URL);
  const [gp] = await p.query(
    `SELECT fuel_ppg, prepass, gross_income, drivers_pay, mileage, generated_at
       FROM gross_profit_reports WHERE year=2026 AND week=43 AND driver_id=24215`
  );
  const [orf] = await p.query(
    `SELECT diesel_gallons, diesel_net, synced_at FROM openroad_fuel_week_totals
      WHERE year=2026 AND week=43 AND driver_id=24215`
  );
  const [gens] = await p.query(
    `SELECT week, COUNT(*) n, MAX(generated_at) generated_at
       FROM gross_profit_reports WHERE year=2026 AND week BETWEEN 36 AND 44
       GROUP BY week ORDER BY week`
  );
  const orPpg =
    orf[0] && Number(orf[0].diesel_gallons) > 0
      ? Number(orf[0].diesel_net) / Number(orf[0].diesel_gallons)
      : null;
  out.verify = {
    chambersGpPpg: gp[0] ? Number(gp[0].fuel_ppg) : null,
    orPpg,
    match:
      gp[0] && orPpg != null
        ? Math.abs(Number(gp[0].fuel_ppg) - orPpg) < 0.01
        : false,
    generated: gens,
  };
  await p.end();
  console.log('verify', out.verify);
} catch (e) {
  out.errors.push(`verify: ${e.message}`);
}

out.finishedAt = new Date().toISOString();
fs.writeFileSync('tmp/store-all-gp-weeks.json', JSON.stringify(out, null, 2));
console.log('WROTE tmp/store-all-gp-weeks.json', 'errors', out.errors.length);
if (out.errors.length) process.exitCode = 1;
