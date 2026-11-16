import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
import mysql from "mysql2/promise";
const p = await mysql.createConnection(process.env.DATABASE_URL);

const cases = [
  ["2610-00659", 20506, 1300, "Kalye"], // SS full 1300
  ["2610-00834", 39073, 642.32, "Mcgrew"],
  ["2610-00478", 39422, 3900, "Elias"],
  ["2610-00828", 38499, 3000, "Evariste"],
  ["2610-00575", 40130, 850, "Wimmer"],
  ["2610-00543", 39188, 1100, "Minor1"],
  ["2610-00806", 39188, 3300, "Minor2"],
];

for (const [gp, did, ss, label] of cases) {
  const [r] = await p.query(
    `SELECT dr.driver_id, dr.revenue, dr.loaded_miles, dr.empty_miles,
            lf.linehaul_rate, lf.detention_sum, l.driver_count
       FROM loads l
       LEFT JOIN load_financials lf ON lf.load_id=l.id
       LEFT JOIN driver_routes dr ON dr.load_id=l.id AND dr.driver_id=?
      WHERE l.gp_load=?
      ORDER BY COALESCE(dr.source_created_at, dr.source_updated_at) DESC
      LIMIT 3`,
    [did, gp]
  );
  console.log(label, { ss, rows: r });
}

// Minor: what detention would give 4455
const [min] = await p.query(
  `SELECT l.gp_load, lf.linehaul_rate, lf.detention_sum,
          (SELECT SUM(amount) FROM driver_accessorials da
            WHERE da.load_id=l.id AND da.driver_id=39188
              AND LOWER(category) LIKE '%detention%') det_paid
     FROM loads l JOIN load_financials lf ON lf.load_id=l.id
    WHERE l.gp_load IN ('2610-00543','2610-00806')`
);
console.log("Minor det", min);

await p.end();
