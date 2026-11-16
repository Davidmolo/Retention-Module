import nextEnv from '@next/env';
import mysql from 'mysql2/promise';

nextEnv.loadEnvConfig(process.cwd());
const p = await mysql.createPool(process.env.DATABASE_URL);

const [tables] = await p.query(`SHOW TABLES`);
const names = tables
  .map((x) => Object.values(x)[0])
  .filter((n) => /pay|settlement|accessorial/i.test(String(n)));
console.log('tables', names);

for (const t of names) {
  try {
    const [cols] = await p.query(`SHOW COLUMNS FROM \`${t}\``);
    console.log(
      `\n${t}:`,
      cols.map((c) => c.Field).join(', ')
    );
  } catch (e) {
    console.log(t, e.message);
  }
}

await p.end();
