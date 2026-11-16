import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
import { fetchFuelTransactions } from "../lib/relay/client.ts";
import { toAppCalendarDate } from "../lib/dates.ts";

const txns = await fetchFuelTransactions({
  dtstart: "2026-10-28T00:00:00Z",
  dtend: "2026-11-04T00:00:00Z",
});
const donald = txns.filter((t) => {
  const n = `${t.driver?.first_name || ""} ${t.driver?.last_name || ""}`.toLowerCase();
  return n.includes("donald") && n.includes("smith");
});
console.log("Donald relay txns", donald.length);
let gal = 0,
  retail = 0,
  paid = 0;
for (const t of donald) {
  const local = toAppCalendarDate(t.created_at);
  let g = 0;
  for (const item of t.fuel_items || []) {
    const ft = String(item.fuel_type || "").toLowerCase();
    if (ft === "diesel" || ft.startsWith("diesel_") || ft === "biodiesel") {
      g += Number(item.volume) || 0;
    }
  }
  if (local >= "2026-10-27" && local <= "2026-11-02") {
    gal += g;
    retail += Number(t.total_retail_price) || 0;
    paid += Number(t.total_amount_paid) || 0;
  }
  console.log({
    local,
    created: t.created_at,
    g,
    retail: t.total_retail_price,
    paid: t.total_amount_paid,
    merchant: t.merchant_name || t.location || t.city,
    keys: Object.keys(t).slice(0, 25),
  });
}
console.log("W45 sum", { gal, retail, paid, saved: retail - paid });
console.log("SS target gal 461.57 total 3004.10");
process.exit(0);
