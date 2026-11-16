import nextEnv from "@next/env";
import mysql from "mysql2/promise";
nextEnv.loadEnvConfig(process.cwd());
const conn = await mysql.createConnection(process.env.DATABASE_URL);
const ids = [2349413, 2355055, 2361503, 2349211];
const [rows] = await conn.query(
  `SELECT l.id, l.driver_id, DATE_FORMAT(l.delivery_at,'%Y-%m-%d') del,
          lf.linehaul_rate, lf.fuel_surcharge, lf.detention_sum, lf.total,
          lf.lumper_sum, lf.misc_sum, lf.additional_charges
     FROM loads l
     LEFT JOIN load_financials lf ON lf.load_id = l.id
    WHERE l.id IN (?)`,
  [ids]
);
console.log(JSON.stringify(rows, null, 2));
const [acc] = await conn.query(
  `SELECT load_id, driver_id, category, amount FROM driver_accessorials WHERE load_id IN (?)`,
  [ids]
);
console.log("acc", JSON.stringify(acc));
await conn.end();
