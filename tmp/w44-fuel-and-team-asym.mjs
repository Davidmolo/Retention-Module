import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
import mysql from "mysql2/promise";
import { weekRange } from "../lib/week.ts";
import { fetchOpenRoadJson } from "../lib/openroad/client.ts";

const p = await mysql.createConnection(process.env.DATABASE_URL);
const w44 = weekRange(2026, 44);
const w43 = weekRange(2026, 43);

// --- Team asymmetry: Kalye load helper share week ---
const LOAD = 2364823; // 2610-00659 Kalye/Mcgrew
const [routes] = await p.query(
  `SELECT dr.driver_id, d.first_name, d.last_name,
          DATE(COALESCE(dr.source_created_at, dr.source_updated_at)) rd,
          DATE(l.delivery_at) del, l.driver_count, l.driver_id owner
     FROM driver_routes dr
     JOIN loads l ON l.id=dr.load_id
     LEFT JOIN drivers d ON d.id=dr.driver_id
    WHERE dr.load_id=?`,
  [LOAD]
);
console.log("Kalye/Mcgrew team load routes + weeks:");
for (const r of routes) {
  const rd = String(r.rd).slice(0, 10);
  const week =
    rd >= w44.start && rd <= w44.end
      ? 44
      : rd >= w43.start && rd <= w43.end
        ? 43
        : rd;
  console.log({
    driver: `${r.first_name} ${r.last_name}`,
    role: Number(r.driver_id) === Number(r.owner) ? "primary" : "helper",
    rd,
    del: String(r.del).slice(0, 10),
    helper_week_by_route: week,
    primary_week_by_del: String(r.del).slice(0, 10) >= w44.start ? 44 : 43,
  });
}

const [mcgrew43] = await p.query(
  `SELECT gross_income FROM gross_profit_reports
    WHERE year=2026 AND week=43 AND driver_name LIKE '%Mcgrew%'`
);
const [mcgrew44] = await p.query(
  `SELECT gross_income FROM gross_profit_reports
    WHERE year=2026 AND week=44 AND driver_name LIKE '%Mcgrew%'`
);
console.log("Mcgrew gross W43", mcgrew43[0], "W44", mcgrew44[0]);

// Elias/Jurevicius load weeks
const [elRoutes] = await p.query(
  `SELECT dr.driver_id, d.first_name, d.last_name,
          DATE(COALESCE(dr.source_created_at, dr.source_updated_at)) rd,
          DATE(l.delivery_at) del, l.driver_id owner, lf.linehaul_rate
     FROM driver_routes dr
     JOIN loads l ON l.id=dr.load_id
     LEFT JOIN load_financials lf ON lf.load_id=l.id
     LEFT JOIN drivers d ON d.id=dr.driver_id
    WHERE l.gp_load='2610-00478'`
);
console.log("Elias team load 2610-00478", elRoutes);

// Check if Jurevicius appears on any W44 GP
const [jurGp] = await p.query(
  `SELECT week, driver_name, gross_income, mileage FROM gross_profit_reports
    WHERE year=2026 AND week IN (43,44) AND driver_name LIKE '%Jurevicius%'`
);
console.log("Jurevicius GP rows", jurGp);

// --- Live OR fuel for Roberson + Stewart ---
const FUEL_URL =
  process.env.OPENROAD_FUEL_CARD_TRANSACTIONS_URL ||
  "https://app.openroadtms.com/api/ext/v1/fuel_card_transactions";

async function liveFuel(driverId, label) {
  const items = [];
  for (let page = 1; page <= 20; page++) {
    const url = new URL(FUEL_URL);
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", "100");
    url.searchParams.set("date[gte]", w44.start);
    url.searchParams.set("date[lte]", w44.end);
    const json = await fetchOpenRoadJson(url.toString());
    const batch = Array.isArray(json?.data) ? json.data : [];
    if (!batch.length) break;
    items.push(...batch);
    if (batch.length < 100) break;
  }
  const mine = items.filter((t) => Number(t.driver_id) === Number(driverId));
  const byUnit = items.filter((t) => {
    // will fill after we know unit
    return false;
  });
  const gal = mine.reduce((s, t) => s + Number(t.diesel_gallons || 0), 0);
  const net = mine.reduce(
    (s, t) =>
      s + Math.max(0, Number(t.diesel_amount || 0) - Number(t.discount || 0)),
    0
  );
  console.log(`\nLIVE OR fuel ${label} driver_id=${driverId}`);
  console.log({
    api_total_txns_week: items.length,
    for_this_driver_id: mine.length,
    gal: Math.round(gal * 1000) / 1000,
    net: Math.round(net * 100) / 100,
    ppg: gal ? Math.round((net / gal) * 10000) / 10000 : null,
    sample: mine.slice(0, 8).map((t) => ({
      date: t.date,
      unit: t.unit,
      card: t.card,
      gal: t.diesel_gallons,
      amt: t.diesel_amount,
      disc: t.discount,
      net_pg: t.net_pg,
      driver_id: t.driver_id,
    })),
  });
  return { items, mine };
}

const roberson = await liveFuel(37886, "Roberson");
const stewart = await liveFuel(39297, "Stewart");

// How many Roberson txns have net_pg matching settlement $5.61?
const rob561 = roberson.mine.filter((t) => {
  const gal = Number(t.diesel_gallons || 0);
  const net = Math.max(
    0,
    Number(t.diesel_amount || 0) - Number(t.discount || 0)
  );
  const ppg = gal ? net / gal : 0;
  return Math.abs(ppg - 5.61) < 0.02 || Math.abs(gal - 75.6) < 0.1;
});
console.log(
  "Roberson txns matching SS ~75.6gal/$5.61",
  rob561.map((t) => ({
    date: t.date,
    gal: t.diesel_gallons,
    amt: t.diesel_amount,
    disc: t.discount,
    net_pg: t.net_pg,
    unit: t.unit,
  }))
);

// Linehaul source: refresh financials fields for mismatched loads
for (const gpLoad of ["2610-00478", "2610-00828", "2610-00575"]) {
  const [lf] = await p.query(
    `SELECT l.gp_load, l.driver_count, lf.linehaul_rate, lf.fuel_surcharge,
            lf.detention_sum, lf.lumper_sum, lf.misc_sum, lf.total, lf.status,
            l.revenue, l.linehaul_rate l_lh
       FROM loads l LEFT JOIN load_financials lf ON lf.load_id=l.id
      WHERE l.gp_load=?`,
    [gpLoad]
  );
  console.log("LH source", lf[0]);
}

await p.end();
