import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());
const { applyDispatcherRosterRules } = await import(
  "../lib/openroad/dispatcherRoster.ts"
);
const mysql = await import("mysql2/promise");

const result = await applyDispatcherRosterRules();
console.log("APPLIED", JSON.stringify(result));

const c = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await c.query(
  `SELECT d.id, d.first_name, d.last_name, d.status, d.manager_id,
          TRIM(CONCAT_WS(' ', m.first_name, m.last_name)) AS manager
     FROM drivers d
     LEFT JOIN tms_users m ON m.id = d.manager_id
    WHERE d.id IN (5198, 18746, 22675)
       OR (d.status = 'active' AND d.manager_id = 5909)`
);
for (const d of rows) {
  console.log(
    [d.id, d.first_name, d.last_name, d.status, d.manager_id, d.manager || ""].join(
      " | "
    )
  );
}
const [left] = await c.query(
  `SELECT COUNT(*) AS n FROM drivers WHERE manager_id = 5909`
);
console.log("STILL_ON_TOM", left[0].n);
await c.end();
