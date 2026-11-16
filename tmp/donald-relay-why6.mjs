import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
import { getPool } from "../lib/db.ts";
import { fetchFuelTransactions } from "../lib/relay/client.ts";
import { toAppCalendarDate } from "../lib/dates.ts";
import { weekRange } from "../lib/week.ts";

const { start, end } = weekRange(2026, 45);
const txns = await fetchFuelTransactions({
  dtstart: "2026-10-26T00:00:00Z",
  dtend: "2026-11-05T00:00:00Z",
});
const pool = getPool();
const [drv] = await pool.query(
  `SELECT id, first_name, last_name FROM drivers WHERE id=5168 OR (LOWER(last_name)='smith' AND LOWER(first_name) LIKE 'donald%')`
);
console.log("drivers", drv);
const [cards] = await pool.query(
  `SELECT DISTINCT TRIM(LEADING 'U' FROM TRIM(card_number)) AS card
     FROM fuel_transactions WHERE driver_id=5168 AND card_number IS NOT NULL`
);
console.log("cards", cards);

for (const t of txns) {
  const local = toAppCalendarDate(t.created_at);
  if (!local || local < start || local > end) continue;
  const n = `${t.driver?.first_name || ""} ${t.driver?.last_name || ""}`.toLowerCase();
  const card = String(t.driver?.integration_id || "").replace(/\D/g, "");
  const hitName = n.includes("donald") && n.includes("smith");
  const hitCard = cards.some((c) => String(c.card).replace(/\D/g, "") === card);
  if (!hitName && !hitCard) continue;
  let g = 0;
  for (const item of t.fuel_items || []) {
    const ft = String(item.fuel_type || "").toLowerCase();
    if (ft === "diesel" || ft.startsWith("diesel_") || ft === "biodiesel")
      g += Number(item.volume) || 0;
  }
  console.log({
    local,
    name: n,
    card,
    hitName,
    hitCard,
    g,
    retail: t.total_retail_price,
    paid: t.total_amount_paid,
  });
}
await pool.end();
process.exit(0);
