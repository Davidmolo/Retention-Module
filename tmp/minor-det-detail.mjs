import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
import mysql from "mysql2/promise";
const p = await mysql.createConnection(process.env.DATABASE_URL);
const [acc] = await p.query(
  `SELECT * FROM driver_accessorials WHERE load_id IN (2358735, 2372106)`
);
console.log(JSON.stringify(acc, null, 2));
await p.end();
