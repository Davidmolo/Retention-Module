import nextEnv from "@next/env";
import mysql from "mysql2/promise";

nextEnv.loadEnvConfig(process.cwd());
const conn = await mysql.createConnection(process.env.DATABASE_URL);
const ids = [2353935, 2356855, 2361092, 2358332, 2354824, 2357640];
const [lf] = await conn.query(
  `SELECT id, load_id, status, linehaul_rate, detention_sum, total, lumper_sum, misc_sum
     FROM load_financials WHERE load_id IN (?) OR id IN (?)`,
  [ids, ids]
);
console.log("LF", lf.length);
for (const r of lf) console.log(JSON.stringify(r));
const [cols] = await conn.query("SHOW COLUMNS FROM load_financials");
console.log(cols.map((c) => c.Field).join(","));
const [da] = await conn.query(
  `SELECT id, load_id, driver_id, amount, category, note,
          DATE_FORMAT(settlement_week_start,'%Y-%m-%d') ws,
          DATE_FORMAT(settlement_week_end,'%Y-%m-%d') we
     FROM driver_accessorials
    WHERE load_id IN (?) OR driver_id IN (23274, 6823, 40518)
    ORDER BY driver_id, ws`,
  [ids]
);
console.log("DA", da.length);
for (const r of da) console.log(JSON.stringify(r));
await conn.end();
