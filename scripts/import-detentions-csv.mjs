/**
 * Import Art's Detentions spreadsheet CSV into MySQL.
 *
 *   pnpm detention:import-csv
 *   pnpm detention:import-csv -- path/to/file.csv
 */
import fs from "node:fs";
import path from "node:path";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const argPath = process.argv.find((a, i) => process.argv[i - 1] === "--");
const csvPath = path.resolve(
  argPath ||
    process.env.DETENTION_CSV_PATH ||
    path.join(process.cwd(), "data", "detention-sample.csv")
);

if (!fs.existsSync(csvPath)) {
  console.error(`CSV not found: ${csvPath}`);
  process.exit(1);
}

/** RFC-ish CSV parse that keeps quoted commas / newlines. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let i = 0;
  let inQuotes = false;
  const s = text.replace(/^\uFEFF/, "");
  while (i < s.length) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.some((x) => String(x).trim() !== "")) rows.push(row);
      row = [];
      i += 1;
      continue;
    }
    field += c;
    i += 1;
  }
  if (field.length || row.length) {
    row.push(field);
    if (row.some((x) => String(x).trim() !== "")) rows.push(row);
  }
  if (!rows.length) return [];
  const headers = rows[0].map((h) => String(h).trim());
  return rows.slice(1).map((cols) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = cols[idx] ?? "";
    });
    return obj;
  });
}

function money(raw) {
  if (raw == null || String(raw).trim() === "") return null;
  const n = Number(String(raw).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function intOrNull(raw) {
  if (raw == null || String(raw).trim() === "") return null;
  const n = Number(String(raw).replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n) : null;
}

function dateOrNull(raw) {
  if (raw == null || String(raw).trim() === "") return null;
  const s = String(raw).trim();
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) {
    return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function datetimeOrNull(raw) {
  if (raw == null || String(raw).trim() === "") return null;
  const s = String(raw).trim();
  const m =
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (m) {
    return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")} ${m[4].padStart(2, "0")}:${m[5]}:${(m[6] || "00").padStart(2, "0")}.000`;
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return d.toISOString().slice(0, 23).replace("T", " ");
  }
  return null;
}

function parseHistory(raw) {
  if (!raw || !String(raw).trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const rows = parseCsv(fs.readFileSync(csvPath, "utf8"));
const { upsertDetention } = await import("../lib/detention/store.ts");

let upserted = 0;
for (const r of rows) {
  const id = String(r.id || "").trim();
  if (!id) continue;
  await upsertDetention({
    id,
    customer: r.Customer || null,
    customerEmail: r["Customer Email"] || null,
    dispatcher: r.Dispatcher || null,
    loadNumber: r["Load #"] || null,
    shipmentNumber: r["Shipment #"] || null,
    driverName: r.Driver || null,
    driverNumber: r["Driver #"] || null,
    truckNumber: r["Truck #"] || null,
    stopType: r["Stop Type"] || null,
    puLocation: r.PU || null,
    puAppt: r["PU APPT"] || null,
    delLocation: r.DEL || null,
    delAppt: r["DEL APPT"] || null,
    arrivalTime: r["Arrival Time"] || null,
    detentionStart: r["Detention Start"] || null,
    driverDeparture: r["Driver Departure"] || null,
    detentionMins: intOrNull(r["Detention Mins"]),
    detentionTimeLabel: r["Detention time"] || null,
    ratePerHour: money(r.Rate) ?? 25,
    amount: money(r.Amount),
    billableAmount: money(r["Billable Amount"]),
    settledAmount: money(r["Settled Amount"]),
    status: r.Status || "New",
    awaitingUs: String(r["Awaiting Us"] || "YES").toUpperCase() !== "NO",
    followUpDate: dateOrNull(r["Follow Up Date"]),
    loadLink: r["Load Link"] || null,
    threadUrl: r["Thread URL"] || null,
    messageId: r.messageId || null,
    threadId: r.threadId || null,
    calendarEventId: r.calendarEventId || null,
    emailDate: datetimeOrNull(r["Email Date"]),
    lastReplyFrom: r["Last Reply From"] || null,
    lastReplyAt: datetimeOrNull(r["Last Reply At"]),
    history: parseHistory(r.history),
    source: "sheet_import",
    createdAt: datetimeOrNull(r.createdAt),
    updatedAt: datetimeOrNull(r.updatedAt),
  });
  upserted += 1;
}

console.log(`Imported ${upserted} detentions from ${csvPath}`);
process.exit(0);
