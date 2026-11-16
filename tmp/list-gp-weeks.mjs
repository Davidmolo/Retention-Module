import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());
const mysql = (await import('mysql2/promise')).default;
const p = await mysql.createConnection(process.env.DATABASE_URL);
const [cols] = await p.query(`SHOW COLUMNS FROM gross_profit_reports`);
console.log(
  'gpr cols sample',
  cols.map((c) => c.Field).filter((f) => /gen|sync|creat|updat|at$/i.test(f))
);
const [w] = await p.query(
  `SELECT year, week, COUNT(*) n
     FROM gross_profit_reports
    GROUP BY year, week
    ORDER BY year, week`
);
console.log(w);
await p.end();
