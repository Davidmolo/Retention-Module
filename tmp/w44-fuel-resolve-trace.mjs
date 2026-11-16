import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
import mysql from "mysql2/promise";
import { weekRange } from "../lib/week.ts";
import { fetchOpenRoadJson } from "../lib/openroad/client.ts";

const { start, end } = weekRange(2026, 44);
const p = await mysql.createConnection(process.env.DATABASE_URL);

const FUEL_URL =
  process.env.OPENROAD_FUEL_CARD_TRANSACTIONS_URL ||
  "https://app.openroadtms.com/api/ext/v1/fuel_card_transactions";

const items = [];
for (let page = 1; page <= 20; page++) {
  const url = new URL(FUEL_URL);
  url.searchParams.set("page", String(page));
  url.searchParams.set("per_page", "100");
  url.searchParams.set("date[gte]", start);
  url.searchParams.set("date[lte]", end);
  const json = await fetchOpenRoadJson(url.toString());
  const batch = Array.isArray(json?.data) ? json.data : [];
  if (!batch.length) break;
  items.push(...batch);
  if (batch.length < 100) break;
}

const [drvRows] = await p.query(`SELECT id FROM drivers`);
const driverIds = new Set(drvRows.map((r) => Number(r.id)));

const [asgRows] = await p.query(
  `SELECT a.driver_id, tr.unit, DATE(a.start_date) AS start_date, DATE(a.end_date) AS end_date
     FROM assignments a JOIN trucks tr ON tr.id=a.truck_id
    WHERE a.truck_id IS NOT NULL AND tr.unit IS NOT NULL
      AND TRIM(CAST(tr.unit AS CHAR)) <> ''
      AND DATE(a.start_date) <= ? AND (a.end_date IS NULL OR DATE(a.end_date) >= ?)`,
  [end, start]
);

function unitKey(u) {
  return String(u ?? "")
    .trim()
    .replace(/^0+/, "")
    .toLowerCase();
}
function cardDigits(c) {
  return String(c ?? "").replace(/\D/g, "");
}

const assignments = asgRows.map((r) => ({
  driverId: Number(r.driver_id),
  unit: unitKey(r.unit),
  start: String(r.start_date).slice(0, 10),
  end: r.end_date == null ? null : String(r.end_date).slice(0, 10),
}));

const driversForUnitDate = (unit, date) => {
  const u = unitKey(unit);
  if (!u) return [];
  const ids = new Set();
  for (const a of assignments) {
    if (a.unit !== u) continue;
    if (a.start > date) continue;
    if (a.end != null && a.end < date) continue;
    ids.add(a.driverId);
  }
  return [...ids];
};

const [cardRows] = await p.query(
  `SELECT driver_id, TRIM(LEADING 'U' FROM TRIM(card_number)) AS card
     FROM fuel_transactions
    WHERE driver_id IS NOT NULL AND card_number IS NOT NULL AND TRIM(card_number) <> ''`
);
const byCard = new Map();
for (const r of cardRows) {
  const card = cardDigits(r.card);
  const id = Number(r.driver_id);
  if (card && id && !byCard.has(card)) byCard.set(card, id);
}

function resolve(t) {
  const rawId = t.driver_id == null ? null : Number(t.driver_id);
  if (rawId != null && Number.isFinite(rawId) && driverIds.has(rawId)) {
    return { id: rawId, via: "driver_id" };
  }
  const date = String(t.date ?? "").slice(0, 10);
  if (date && t.unit) {
    const hits = driversForUnitDate(String(t.unit), date);
    if (hits.length === 1) return { id: hits[0], via: "unit" };
    if (hits.length > 1) return { id: null, via: `unit_ambiguous_${hits.length}`, hits };
  }
  const card = cardDigits(t.card);
  if (card && byCard.has(card)) return { id: byCard.get(card), via: "card" };
  return { id: null, via: "unmatched" };
}

for (const target of [
  { id: 37886, name: "Roberson" },
  { id: 39297, name: "Stewart" },
]) {
  const hits = [];
  for (const t of items) {
    const gal = Number(t.diesel_gallons || 0);
    if (gal <= 0) continue;
    const r = resolve(t);
    if (r.id !== target.id) continue;
    const net = Math.max(
      0,
      Number(t.diesel_amount || 0) - Number(t.discount || 0)
    );
    hits.push({
      via: r.via,
      date: t.date,
      unit: t.unit,
      card: String(t.card || "").slice(-4),
      api_driver_id: t.driver_id,
      gal,
      net: Math.round(net * 100) / 100,
      net_pg: t.net_pg,
    });
  }
  const gal = hits.reduce((s, h) => s + h.gal, 0);
  const net = hits.reduce((s, h) => s + h.net, 0);
  const byVia = {};
  for (const h of hits) byVia[h.via] = (byVia[h.via] || 0) + 1;
  console.log("\n", target.name, {
    txns: hits.length,
    gal: Math.round(gal * 1000) / 1000,
    net: Math.round(net * 100) / 100,
    ppg: gal ? Math.round((net / gal) * 10000) / 10000 : null,
    byVia,
    hits,
  });
}

await p.end();
