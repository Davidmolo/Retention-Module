import nextEnv from "@next/env";
import mysql from "mysql2/promise";
nextEnv.loadEnvConfig(process.cwd());
const conn = await mysql.createConnection(process.env.DATABASE_URL);

const [loads] = await conn.query(
  `SELECT l.id, l.gp_load, DATE_FORMAT(l.delivery_at,'%Y-%m-%d') del,
          l.miles, l.empty_miles, l.driver_count,
          lf.linehaul_rate, lf.detention_sum, lf.total
     FROM loads l
     LEFT JOIN load_financials lf ON lf.load_id = l.id
    WHERE l.driver_id = 37820
      AND DATE(l.delivery_at) BETWEEN '2026-10-20' AND '2026-10-26'
    ORDER BY l.delivery_at`
);
console.log("W44 LOADS");
let lh = 0, det = 0, mi = 0;
for (const r of loads) {
  lh += Number(r.linehaul_rate || 0);
  det += Number(r.detention_sum || 0);
  mi += Number(r.miles || 0) + Number(r.empty_miles || 0);
  console.log(JSON.stringify(r));
}
console.log("sum linehaul", lh, "detention", det, "gross", lh + det, "miles", mi);

const [acc] = await conn.query(
  `SELECT load_id, category, amount FROM driver_accessorials
    WHERE driver_id = 37820
      AND settlement_week_start = '2026-10-20'
      AND settlement_week_end = '2026-10-26'`
);
console.log("W44 ACC", JSON.stringify(acc));

const [rep] = await conn.query(
  `SELECT mileage, gross_income, drivers_pay FROM gross_profit_reports
    WHERE year=2026 AND week=44 AND driver_id=37820`
);
console.log("STORED W44", JSON.stringify(rep));

const ids = [39422, 35016, 40432, 38499, 39919, 38312];
const [round] = await conn.query(
  `SELECT l.driver_id, l.gp_load, DATE_FORMAT(l.delivery_at,'%Y-%m-%d') del,
          lf.linehaul_rate, lf.detention_sum, a.category, a.amount,
          DATE_FORMAT(a.settlement_week_end,'%Y-%m-%d') we
     FROM loads l
     LEFT JOIN load_financials lf ON lf.load_id = l.id
     LEFT JOIN driver_accessorials a ON a.load_id = l.id AND a.driver_id = l.driver_id
    WHERE l.driver_id IN (?)
      AND DATE(l.delivery_at) BETWEEN '2026-10-06' AND '2026-10-19'
      AND (COALESCE(lf.detention_sum,0) <> 0 OR a.id IS NOT NULL)
    ORDER BY l.driver_id, l.delivery_at`,
  [ids]
);
console.log("\nROUND-GAP DRIVERS DET/ACC");
for (const r of round) console.log(JSON.stringify(r));
await conn.end();
