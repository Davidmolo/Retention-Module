import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());
import mysql from 'mysql2/promise';

const pool = mysql.createPool(process.env.DATABASE_URL);

const [overrides] = await pool.query(
  `SELECT driver_id, driver_name, equipment_lease, pd_insurance,
          liability_credit, xxii_fee_pct
     FROM gp_oo_driver_overrides
    WHERE driver_name LIKE '%Wagner%'`
);
console.log('overrides', overrides);

const [rates] = await pool.query(
  `SELECT config_key, config_value FROM gp_config
    WHERE config_key LIKE '%liability%' OR config_key LIKE 'oo_%'`
);
console.log('rates', rates);

const [reports] = await pool.query(
  `SELECT id, week, year, week_start, week_end
     FROM gross_profit_reports
    WHERE week = 45
    ORDER BY id DESC LIMIT 3`
);
console.log('reports', reports);

if (reports[0]) {
  const [rows] = await pool.query(
    `SELECT driver_name, mileage, total_gross_in, liability_insurance,
            cargo_insurance, rm, equipment_lease, factoring_fee, samsara,
            pd_insurance, total_expenses, gross_profit, fuel_gross, fuel_net
       FROM gross_profit_report_drivers
      WHERE report_id = ? AND driver_name LIKE '%Wagner%'`,
    [reports[0].id]
  );
  console.log('w45 wagner', rows);
  if (rows[0]) {
    const m = Number(rows[0].mileage);
    const charge = m * 0.15 + 16;
    const credit = Number(overrides[0]?.liability_credit ?? 0);
    console.log({
      mileage: m,
      charge,
      credit,
      clamped: Math.max(0, charge - credit),
      unclamped: charge - credit,
      mantas: -141.68,
    });
  }
}

await pool.end();
