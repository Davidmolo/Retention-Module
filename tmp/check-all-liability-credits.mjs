import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());
import mysql from 'mysql2/promise';

const pool = mysql.createPool(process.env.DATABASE_URL);

const [ratesRows] = await pool.query(
  `SELECT config_key, config_value FROM gp_config
    WHERE config_key IN ('oo_liability_per_mile', 'oo_liability_flat')`
);
const rates = Object.fromEntries(
  ratesRows.map((r) => [r.config_key, Number(r.config_value)])
);
const perMile = rates.oo_liability_per_mile ?? 0.15;
const flat = rates.oo_liability_flat ?? 16;

const [overrides] = await pool.query(
  `SELECT driver_id, driver_name, liability_credit, equipment_lease, pd_insurance
     FROM gp_oo_driver_overrides
    WHERE liability_credit IS NOT NULL AND liability_credit > 0
    ORDER BY driver_name`
);
console.log('OO with liability credit > 0:', overrides.length);
console.log('rates', { perMile, flat });

const [weeks] = await pool.query(
  `SELECT DISTINCT year, week FROM gross_profit_reports
    ORDER BY year DESC, week DESC LIMIT 6`
);

const affected = [];
for (const w of weeks) {
  for (const o of overrides) {
    const [rows] = await pool.query(
      `SELECT driver_name, mileage, liability_insurance, gross_profit
         FROM gross_profit_reports
        WHERE year = ? AND week = ? AND driver_id = ?
        LIMIT 1`,
      [w.year, w.week, o.driver_id]
    );
    if (!rows[0]) continue;
    const mileage = Number(rows[0].mileage);
    const credit = Number(o.liability_credit);
    const charge = mileage * perMile + flat;
    const unclamped = Math.round((charge - credit) * 100) / 100;
    const clamped = Math.max(0, unclamped);
    const stored = Number(rows[0].liability_insurance);
    if (unclamped < 0 || stored === 0 && credit > charge) {
      affected.push({
        week: `W${w.week}`,
        driver: o.driver_name,
        mileage,
        credit,
        charge: Math.round(charge * 100) / 100,
        shouldBe: unclamped,
        wasClampedTo: clamped,
        stored,
      });
    }
  }
}

console.log('\nCases where credit exceeds charge (were forced to $0):');
console.table(affected);

const allCredits = overrides.map((o) => ({
  driver: o.driver_name,
  credit: Number(o.liability_credit),
}));
console.log('\nAll liability credits configured:');
console.table(allCredits);

await pool.end();
