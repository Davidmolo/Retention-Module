// Re-run remainder revenue allocation for every load that has 2+ driver_routes.
import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());
import mysql from 'mysql2/promise';
import { allocateRouteRevenueForLoads } from '../lib/openroad/driverRoutes.ts';

const pool = mysql.createPool(process.env.DATABASE_URL);
const [rows] = await pool.query(
  `SELECT load_id FROM driver_routes
    WHERE load_id IS NOT NULL
    GROUP BY load_id
   HAVING COUNT(*) >= 2`
);
const ids = rows.map((r) => Number(r.load_id));
console.log(`reallocating ${ids.length} multi-driver loads…`);
const chunk = 200;
let updated = 0;
for (let i = 0; i < ids.length; i += chunk) {
  updated += await allocateRouteRevenueForLoads(ids.slice(i, i + chunk));
  process.stdout.write(`  ${Math.min(i + chunk, ids.length)}/${ids.length}\r`);
}
console.log(`\ndone, route rows touched≈${updated}`);
await pool.end();
process.exit(0);
