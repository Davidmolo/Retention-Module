import nextEnv from '@next/env';
import mysql from 'mysql2/promise';

nextEnv.loadEnvConfig(process.cwd());
const p = await mysql.createPool(process.env.DATABASE_URL);

const id = 24215; // Chambers
const [rf] = await p.query(
  `SELECT * FROM relay_fuel_week_totals WHERE driver_id=? AND year=2026 AND week=43`,
  [id]
);
console.log('relay_fuel_week_totals W43', rf);

const [card] = await p.query(
  `SELECT SUM(gallons) gal, SUM(amount) amt,
          SUM(COALESCE(amount_retail, amount)) retail,
          COUNT(*) n
     FROM fuel_transactions
    WHERE driver_id=? AND transaction_date BETWEEN '2026-10-13' AND '2026-10-19'`,
  [id]
);
console.log('fuel_transactions W43', card[0]);
if (Number(card[0]?.gal) > 0) {
  console.log('card PPG', Number(card[0].amt) / Number(card[0].gal));
}
if (rf[0] && Number(rf[0].gallons) > 0) {
  console.log(
    'relay PPG paid/gal',
    Number(rf[0].amount_paid) / Number(rf[0].gallons)
  );
  console.log(
    'relay PPG retail/gal',
    Number(rf[0].amount_retail) / Number(rf[0].gallons)
  );
}

const [cols] = await p.query(`SHOW COLUMNS FROM relay_fuel_week_totals`);
console.log(
  'relay cols',
  cols.map((c) => c.Field).join(', ')
);

await p.end();
