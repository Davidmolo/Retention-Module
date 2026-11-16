import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const { fetchOpenRoadJson } = await import("../lib/openroad/client.ts");
const base = "https://app.openroadtms.com/api/ext/v1/driver_pay_statements";

async function hit(label, url) {
  try {
    const json = await fetchOpenRoadJson(url);
    const data = json?.data;
    const rows = Array.isArray(data) ? data : data ? [data] : [];
    const first = rows[0] || null;
    console.log(
      JSON.stringify({
        label,
        status: "ok",
        total: json?.meta?.total ?? null,
        rows: rows.length,
        id: first?.id ?? null,
        driver_id: first?.driver_id ?? null,
        period_start: first?.period_start ?? null,
        keys: first ? Object.keys(first).join(",") : "",
      })
    );
    return first?.id || null;
  } catch (e) {
    const msg = String(e.message || e);
    const code = msg.match(/\b(\d{3})\b/)?.[1] || "error";
    console.log(JSON.stringify({ label, status: code, message: msg.slice(0, 220) }));
    return null;
  }
}

const id = await hit("list", `${base}?per_page=5&sort=-period_start`);
await hit("list-w43", `${base}?per_page=5&period_start=2026-10-13`);
if (id) {
  await hit("show", `${base}/${encodeURIComponent(id)}`);
} else {
  await hit("show-missing", `${base}/23274_2026-10-13`);
}
