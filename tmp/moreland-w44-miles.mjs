import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
import mysql from "mysql2/promise";
const p = await mysql.createConnection(process.env.DATABASE_URL);
const id = 37820;
const [rts] = await p.query(
  `SELECT l.gp_load, l.driver_id owner, DATE(l.delivery_at) del,
          DATE(COALESCE(dr.source_created_at,dr.source_updated_at)) rd,
          dr.loaded_miles, dr.empty_miles,
          COALESCE(dr.loaded_miles,0)+COALESCE(dr.empty_miles,0) mi,
          dr.revenue, lf.linehaul_rate
     FROM driver_routes dr
     JOIN loads l ON l.id=dr.load_id
     LEFT JOIN load_financials lf ON lf.load_id=l.id
    WHERE dr.driver_id=?
    ORDER BY rd`,
  [id]
);
console.log("all routes", rts.length);
const w44 = rts.filter((r) => {
  const del = String(r.del).slice(0, 10);
  const rd = String(r.rd).slice(0, 10);
  const owned = Number(r.owner) === id;
  if (owned) return del >= "2026-10-20" && del <= "2026-10-26";
  return rd >= "2026-10-20" && rd <= "2026-10-26";
});
console.log(
  "w44",
  w44.map((r) => ({
    gp: r.gp_load,
    owner: r.owner,
    del: String(r.del).slice(0, 10),
    rd: String(r.rd).slice(0, 10),
    mi: Number(r.mi),
    lh: Number(r.linehaul_rate),
    rev: Number(r.revenue),
  }))
);
console.log(
  "sum mi",
  w44.reduce((s, r) => s + Number(r.mi), 0)
);
// loads with lh matching 1450+1300+1400+1350+2200
const [cand] = await p.query(
  `SELECT l.gp_load, DATE(l.delivery_at) del, lf.linehaul_rate, lf.detention_sum,
          l.miles, l.empty_miles, l.customer_name
     FROM loads l LEFT JOIN load_financials lf ON lf.load_id=l.id
    WHERE l.driver_id=? AND DATE(l.delivery_at) BETWEEN '2026-10-15' AND '2026-11-02'
    ORDER BY l.delivery_at`,
  [id]
);
console.log("Moreland loads mid-Oct", cand);
await p.end();
