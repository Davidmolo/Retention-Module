import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());
const mysql = (await import('mysql2/promise')).default;
const p = await mysql.createConnection(process.env.DATABASE_URL);

const [all] = await p.query(
  `SELECT l.id, l.driver_id, l.helper_driver_id, l.driver_count,
          DATE(l.delivery_at) del, lf.linehaul_rate, lf.detention_sum,
          l.miles, l.empty_miles
     FROM loads l
     LEFT JOIN load_financials lf ON lf.load_id = l.id
    WHERE DATE(l.delivery_at) BETWEEN '2026-10-13' AND '2026-10-19'
      AND LOWER(TRIM(COALESCE(l.status,''))) <> 'canceled'
      AND (l.driver_id = 39422 OR l.helper_driver_id = 39422)
    ORDER BY l.id`
);
console.log('all elias week loads', all);

const [routes] = await p.query(
  `SELECT dr.load_id, dr.revenue, dr.loaded_miles, dr.empty_miles,
          DATE(dr.source_created_at) created, DATE(l.delivery_at) del,
          l.driver_id, l.driver_count
     FROM driver_routes dr
     JOIN loads l ON l.id = dr.load_id
    WHERE dr.driver_id = 39422
      AND (
        DATE(l.delivery_at) BETWEEN '2026-10-13' AND '2026-10-19'
        OR DATE(COALESCE(dr.source_created_at, dr.source_updated_at))
            BETWEEN '2026-10-13' AND '2026-10-19'
      )
    ORDER BY dr.load_id, dr.id`
);
console.log('elias routes broad', routes);

// Brittain / Gilbert / Moreland pay-only gaps
for (const id of [18754, 40249, 37820, 39073]) {
  const [acc] = await p.query(
    `SELECT category, amount, load_id, note, settlement_week_start, settlement_status
       FROM driver_accessorials WHERE driver_id=?
         AND (
           (settlement_week_start='2026-10-13' AND settlement_week_end='2026-10-19')
           OR settlement_week_start BETWEEN '2026-10-06' AND '2026-10-20'
         )
       ORDER BY settlement_week_start, id`,
    [id]
  );
  const [gp] = await p.query(
    `SELECT driver_name, drivers_pay, mileage, gross_income FROM gross_profit_reports
      WHERE year=2026 AND week=43 AND driver_id=?`,
    [id]
  );
  console.log('\n', gp[0]?.driver_name, 'pay', gp[0]?.drivers_pay, 'acc', acc);
}

await p.end();
