import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const { storeWeeklySummary } = await import("../lib/sources/weeklySummary.ts");
const mysql = (await import("mysql2/promise")).default;

const weeks = [43, 42, 44, 41, 40, 39, 38, 37, 36];
for (const w of weeks) {
  try {
    const r = await storeWeeklySummary(2026, w);
    console.log("stored W" + w, r.drivers);
  } catch (e) {
    console.error("FAIL W" + w, e?.message || e);
  }
}

const p = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await p.query(
  `SELECT driver_name, mileage, gross_income, drivers_pay
   FROM gross_profit_reports
   WHERE year=2026 AND week=43
     AND (driver_name LIKE '%Meighan%'
       OR driver_name LIKE '%Crayton%'
       OR driver_name LIKE '%Elias%'
       OR driver_name LIKE '%Roberson%'
       OR driver_name LIKE '%Evariste%'
       OR driver_name LIKE '%Turner%'
       OR driver_name LIKE '%Chambers%')
   ORDER BY driver_name`
);
console.log(JSON.stringify(rows, null, 2));
await p.end();
