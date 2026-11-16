import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
import mysql from "mysql2/promise";
const p = await mysql.createConnection(process.env.DATABASE_URL);

const cases = [
  { name: "Elias", gp: "2610-00478", did: 39422, ssLh: 3900 },
  { name: "Evariste", gp: "2610-00828", did: 38499, ssLh: 3000 },
  { name: "Wimmer", gp: "2610-00575", did: 40130, ssLh: 850 },
];

for (const c of cases) {
  const [rows] = await p.query(
    `SELECT l.gp_load, l.driver_count, l.helper_driver_id,
            lf.linehaul_rate full_lh,
            dr.driver_id, dr.loaded_miles, dr.empty_miles, dr.revenue route_rev,
            (SELECT SUM(COALESCE(dr2.loaded_miles,0)) FROM driver_routes dr2
              WHERE dr2.load_id=l.id AND dr2.driver_id IS NOT NULL) all_loaded
       FROM loads l
       LEFT JOIN load_financials lf ON lf.load_id=l.id
       LEFT JOIN driver_routes dr ON dr.load_id=l.id AND dr.driver_id=?
      WHERE l.gp_load=?
      ORDER BY COALESCE(dr.source_created_at,dr.source_updated_at) DESC
      LIMIT 1`,
    [c.did, c.gp]
  );
  const r = rows[0];
  const full = Number(r.full_lh);
  const lm = Number(r.loaded_miles);
  const all = Number(r.all_loaded);
  const prop = all > 0 ? (full * lm) / all : null;
  console.log(c.name, {
    full_lh: full,
    route_rev: Number(r.route_rev),
    ss: c.ssLh,
    loaded: lm,
    all_drivers_loaded: all,
    mile_share_of_full: prop ? Math.round(prop * 100) / 100 : null,
    ss_minus_route: Math.round((c.ssLh - Number(r.route_rev)) * 100) / 100,
    dc: r.driver_count,
  });
}

// Moreland W44: what GP has vs claimed SS
const [m] = await p.query(
  `SELECT l.gp_load, DATE(l.delivery_at) del, l.driver_count,
          lf.linehaul_rate, lf.detention_sum,
          (SELECT dr.revenue FROM driver_routes dr
            WHERE dr.load_id=l.id AND dr.driver_id=l.driver_id
            ORDER BY COALESCE(dr.source_created_at,dr.source_updated_at) DESC LIMIT 1) route_rev,
          (SELECT COALESCE(dr.loaded_miles,0)+COALESCE(dr.empty_miles,0) FROM driver_routes dr
            WHERE dr.load_id=l.id AND dr.driver_id=37820
            ORDER BY COALESCE(dr.source_created_at,dr.source_updated_at) DESC LIMIT 1) mi
     FROM loads l LEFT JOIN load_financials lf ON lf.load_id=l.id
    WHERE l.driver_id=37820
      AND DATE(l.delivery_at) BETWEEN '2026-10-20' AND '2026-10-26'
    ORDER BY l.delivery_at`
);
console.log("\nMoreland W44 owned loads in GP week");
let g = 0,
  mi = 0;
for (const r of m) {
  const lh = Number(r.route_rev || r.linehaul_rate || 0);
  g += lh;
  mi += Number(r.mi || 0);
  console.log({
    gp: r.gp_load,
    del: String(r.del).slice(0, 10),
    dc: r.driver_count,
    lf: Number(r.linehaul_rate),
    route: Number(r.route_rev),
    mi: Number(r.mi),
  });
}
console.log({ gp_gross_approx: g, gp_mi_approx: mi, ss_claimed: { g: 5700, mi: 2246.61 } });

await p.end();
