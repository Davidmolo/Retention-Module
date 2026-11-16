import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
import { fetchFuelTransactions } from "../lib/relay/client.ts";
import { toAppCalendarDate } from "../lib/dates.ts";
import { getPool } from "../lib/db.ts";

const txns = await fetchFuelTransactions({
  dtstart: "2026-10-28T00:00:00Z",
  dtend: "2026-11-05T00:00:00Z",
});
const singh = txns.filter((t) => {
  const n = `${t.driver?.first_name || ""} ${t.driver?.last_name || ""}`.toLowerCase();
  return n.includes("manpreet");
});
const pool = getPool();
const [cards] = await pool.query(
  `SELECT driver_id, TRIM(LEADING 'U' FROM TRIM(card_number)) AS card
     FROM fuel_transactions
    WHERE driver_id = 35540 AND card_number IS NOT NULL
    LIMIT 30`
);
console.log("cards", cards);

let total = 0;
for (const t of singh) {
  const local = toAppCalendarDate(t.created_at);
  if (local < "2026-10-27" || local > "2026-11-02") continue;
  let gal = 0;
  for (const item of t.fuel_items || []) {
    const ft = String(item.fuel_type || "").toLowerCase();
    if (ft === "diesel" || ft.startsWith("diesel_") || ft === "biodiesel") {
      gal += Number(item.volume) || 0;
    }
  }
  total += gal;
  console.log({
    local,
    gal,
    integration: t.driver?.integration_id,
    first: t.driver?.first_name,
    last: t.driver?.last_name,
  });
}
console.log("W45 Manpreet gal", total, "fee", Math.round(total * 0.12 * 100) / 100);
await pool.end();
process.exit(0);
