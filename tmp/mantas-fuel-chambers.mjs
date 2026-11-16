import nextEnv from '@next/env';
import mysql from 'mysql2/promise';

nextEnv.loadEnvConfig(process.cwd());
const p = await mysql.createPool(process.env.DATABASE_URL);

const id = 24215;
const start = '2026-10-13';
const end = '2026-10-19';

const [fuel] = await p.query(
  `SELECT product_code, COUNT(*) n, SUM(gallons) gal, SUM(amount) amt
     FROM fuel_transactions
    WHERE driver_id=? AND transaction_date BETWEEN ? AND ?
    GROUP BY product_code
    ORDER BY gal DESC`,
  [id, start, end]
);
console.log('Chambers by product_code');
for (const r of fuel) {
  console.log({
    code: r.product_code,
    n: Number(r.n),
    gal: Number(r.gal),
    amt: Number(r.amt),
    ppg: Number(r.gal) > 0 ? Number((Number(r.amt) / Number(r.gal)).toFixed(4)) : null,
  });
}
const gal = fuel.reduce((s, r) => s + Number(r.gal), 0);
const amt = fuel.reduce((s, r) => s + Number(r.amt), 0);
console.log('ALL ppg', (amt / gal).toFixed(4), 'gal', gal, 'amt', amt);

await p.end();
