import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
import mysql from "mysql2/promise";
const p = await mysql.createConnection(process.env.DATABASE_URL);

const [kalyeHelper] = await p.query(
  `SELECT dr.driver_id, d.first_name, d.last_name, dr.revenue, dr.loaded_miles
     FROM driver_routes dr LEFT JOIN drivers d ON d.id=dr.driver_id
    WHERE dr.load_id=(SELECT id FROM loads WHERE gp_load='2610-00659')`
);
console.log("Kalye load routes", kalyeHelper);

const focus = [
  [39422, "Elias", 8318],
  [20506, "Kalye", 9191.51],
  [38499, "Evariste", 9495],
  [39073, "Mcgrew", 6343.36],
  [40130, "Wimmer", 8869.83],
  [39188, "Minor", 4455],
  [37886, "Roberson", 3201.54],
];

for (const [id, name, ss] of focus) {
  // A: full lf linehaul to primary + net det (current det formula)
  const [a] = await p.query(
    `SELECT SUM(
       COALESCE(lf.linehaul_rate,0)
       + GREATEST(0, COALESCE(lf.detention_sum,0) - COALESCE((
           SELECT SUM(amount) FROM driver_accessorials da
            WHERE da.load_id=l.id AND da.driver_id=l.driver_id
              AND LOWER(COALESCE(category,'')) LIKE '%detention%'
         ),0))
     ) g
       FROM loads l LEFT JOIN load_financials lf ON lf.load_id=l.id
      WHERE l.driver_id=?
        AND DATE(l.delivery_at) BETWEEN '2026-10-20' AND '2026-10-26'
        AND LOWER(TRIM(COALESCE(l.status,''))) <> 'canceled'`,
    [id]
  );
  // A + only add detention when settlement-like: det_paid>0 OR det_sum==0 already
  // Mantas: invisible detention_sum should not be added. Proxy: only count
  // detention_sum when there is a detention accessorial on the load (paid)
  // OR when det_sum - paid yields the small settlement amount — simpler:
  // use detention_sum only if <= paid*2+100 OR paid>0; else 0.
  // Better Mantas rule: detention_received visible. Use:
  //   if det_paid > 0: use detention_sum (received at least partially settled)
  //   else if det_sum > 0 and det_sum <= 500: use det_sum (small billed)
  //   else: 0
  const [a2] = await p.query(
    `SELECT SUM(
       COALESCE(lf.linehaul_rate,0)
       + GREATEST(0,
           CASE
             WHEN COALESCE((
               SELECT SUM(amount) FROM driver_accessorials da
                WHERE da.load_id=l.id AND da.driver_id=l.driver_id
                  AND LOWER(COALESCE(category,'')) LIKE '%detention%'
             ),0) > 0 THEN COALESCE(lf.detention_sum,0)
             WHEN COALESCE(lf.detention_sum,0) > 0
              AND COALESCE(lf.detention_sum,0) <= 250 THEN COALESCE(lf.detention_sum,0)
             ELSE 0
           END
           - COALESCE((
               SELECT SUM(amount) FROM driver_accessorials da
                WHERE da.load_id=l.id AND da.driver_id=l.driver_id
                  AND LOWER(COALESCE(category,'')) LIKE '%detention%'
             ),0)
         )
     ) g
       FROM loads l LEFT JOIN load_financials lf ON lf.load_id=l.id
      WHERE l.driver_id=?
        AND DATE(l.delivery_at) BETWEEN '2026-10-20' AND '2026-10-26'
        AND LOWER(TRIM(COALESCE(l.status,''))) <> 'canceled'`,
    [id]
  );
  // Route revenue for linehaul (settlement-like) + sane det
  const [rv] = await p.query(
    `SELECT SUM(
       COALESCE(
         (
           SELECT dr.revenue FROM driver_routes dr
            WHERE dr.load_id=l.id AND dr.driver_id=l.driver_id
              AND dr.id = (
                SELECT dr2.id FROM driver_routes dr2
                 WHERE dr2.load_id=l.id AND dr2.driver_id=l.driver_id
                 ORDER BY COALESCE(dr2.source_created_at,dr2.source_updated_at) DESC,
                          dr2.id DESC
                 LIMIT 1
              )
         ),
         lf.linehaul_rate,
         0
       )
       + GREATEST(0,
           CASE
             WHEN COALESCE((
               SELECT SUM(amount) FROM driver_accessorials da
                WHERE da.load_id=l.id AND da.driver_id=l.driver_id
                  AND LOWER(COALESCE(category,'')) LIKE '%detention%'
             ),0) > 0 THEN COALESCE(lf.detention_sum,0)
             WHEN COALESCE(lf.detention_sum,0) > 0
              AND COALESCE(lf.detention_sum,0) <= 250 THEN COALESCE(lf.detention_sum,0)
             ELSE 0
           END
           - COALESCE((
               SELECT SUM(amount) FROM driver_accessorials da
                WHERE da.load_id=l.id AND da.driver_id=l.driver_id
                  AND LOWER(COALESCE(category,'')) LIKE '%detention%'
             ),0)
         )
     ) g
       FROM loads l LEFT JOIN load_financials lf ON lf.load_id=l.id
      WHERE l.driver_id=?
        AND DATE(l.delivery_at) BETWEEN '2026-10-20' AND '2026-10-26'
        AND LOWER(TRIM(COALESCE(l.status,''))) <> 'canceled'`,
    [id]
  );
  console.log(name, {
    ss,
    A_full: Number(a[0].g),
    A_saneDet: Number(a2[0].g),
    routeLh_saneDet: Number(rv[0].g),
    dA: Math.round((Number(a[0].g) - ss) * 100) / 100,
    dA2: Math.round((Number(a2[0].g) - ss) * 100) / 100,
    dRv: Math.round((Number(rv[0].g) - ss) * 100) / 100,
  });
}
await p.end();
