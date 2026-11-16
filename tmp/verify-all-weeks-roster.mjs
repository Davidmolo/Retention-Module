import nextEnv from '@next/env';
import mysql from 'mysql2/promise';

nextEnv.loadEnvConfig(process.cwd());
const p = await mysql.createPool(process.env.DATABASE_URL);

const [weeks] = await p.query(
  `SELECT year, week, COUNT(*) AS n,
          SUM(CASE WHEN LOWER(COALESCE(driver_status,'')) <> 'active' THEN 1 ELSE 0 END) AS non_active,
          SUM(CASE WHEN LOWER(driver_name) LIKE '%jurevicius%' THEN 1 ELSE 0 END) AS jurevicius
     FROM gross_profit_reports
    GROUP BY year, week
    ORDER BY year, week`
);
console.log('All stored GP weeks:');
for (const w of weeks) {
  console.log({
    year: w.year,
    week: w.week,
    drivers: Number(w.n),
    nonActive: Number(w.non_active),
    jurevicius: Number(w.jurevicius),
    ok: Number(w.non_active) === 0 && Number(w.jurevicius) === 0,
  });
}

const bad = weeks.filter(
  (w) => Number(w.non_active) > 0 || Number(w.jurevicius) > 0
);
console.log(
  bad.length
    ? `NEED REBUILD: ${bad.length} weeks still dirty`
    : 'ALL WEEKS CLEAN (active only, no Jurevicius)'
);

await p.end();
process.exit(bad.length ? 1 : 0);
