import nextEnv from "@next/env";
import mysql from "mysql2/promise";
import fs from "fs";

nextEnv.loadEnvConfig(process.cwd());
const data = JSON.parse(fs.readFileSync("tmp/gp-compare-fixed.json", "utf8"));
const names = [
  "rodney coleman",
  "frank carr",
  "craig greene",
  "jeffery roberson",
  "michael mcginnis",
  "mcginnis",
  "kenneth houston",
  "deandre meighan",
  "daniel nedeljkovic",
  "rahul sood",
  "chris brittain",
  "robert moreland",
  "gerald kalyesubula",
];

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.query(
  `SELECT year, week, driver_id, driver_name, driver_status, driver_type,
          mileage, gross_income, drivers_pay
     FROM gross_profit_reports
    WHERE year = 2026 AND week IN (42, 43)
      AND (
        driver_name LIKE '%Coleman%' OR driver_name LIKE '%Carr%'
        OR driver_name LIKE '%Greene%' OR driver_name LIKE '%Roberson%'
        OR driver_name LIKE '%Mcginnis%' OR driver_name LIKE '%McGinnis%'
        OR driver_name LIKE '%Houston%' OR driver_name LIKE '%Meighan%'
        OR driver_name LIKE '%Nedeljkovic%' OR driver_name LIKE '%Sood%'
        OR driver_name LIKE '%Brittain%' OR driver_name LIKE '%Moreland%'
        OR driver_name LIKE '%Kalyesubula%'
      )
    ORDER BY driver_name, week`
);
console.log("DB");
for (const r of rows) {
  console.log(
    `W${r.week} ${r.driver_name} ${r.driver_id} ${r.driver_status} ${r.driver_type} mi ${r.mileage} g ${r.gross_income} pay ${r.drivers_pay}`
  );
}

function hits(name) {
  const n = name.toLowerCase();
  return data.mismatches.filter((m) =>
    String(m.dbName || m.name).toLowerCase().includes(n)
  );
}
console.log("\nMISMATCHES");
for (const n of [
  "coleman",
  "carr",
  "greene",
  "roberson",
  "mcginnis",
  "houston",
  "meighan",
  "nedeljkovic",
  "sood",
  "brittain",
  "moreland",
  "kalyesubula",
]) {
  const ms = hits(n);
  if (!ms.length) {
    console.log(n, "no mismatch");
    continue;
  }
  for (const m of ms) {
    const bits = m.diffs
      .filter((d) => ["mileage", "gross", "pay"].includes(d.field))
      .map((d) => `${d.field} sheet ${d.sheet} db ${d.db} d ${d.delta}`)
      .join(" | ");
    console.log(`W${m.week} ${m.dbName} ${m.id} ${bits || "(mpg/prepass/ppg only)"}`);
  }
}

const [fin] = await conn.query(
  `SELECT l.id, l.driver_id, DATE_FORMAT(l.delivery_at, '%Y-%m-%d %H:%i') del,
          l.miles, lf.linehaul_rate, lf.detention_sum, lf.total
     FROM loads l
     LEFT JOIN load_financials lf ON lf.load_id = l.id
    WHERE l.driver_id IN (23274, 6823)
      AND DATE(l.delivery_at) BETWEEN '2026-10-13' AND '2026-10-19'
    ORDER BY l.driver_id, l.delivery_at`
);
console.log("\nW43 LOADS");
for (const r of fin) console.log(JSON.stringify(r));

const [acc] = await conn.query(
  `SELECT driver_id, load_id, category, amount, DATE_FORMAT(settlement_week_end, '%Y-%m-%d') wk
     FROM driver_accessorials
    WHERE driver_id IN (23274, 40518, 37886, 22054, 38402, 18754, 37820, 20506)
      AND settlement_week_end >= '2026-10-06' AND settlement_week_end <= '2026-10-20'
    ORDER BY driver_id, settlement_week_end`
);
console.log("\nACCESSORIALS");
for (const r of acc) console.log(JSON.stringify(r));
await conn.end();
