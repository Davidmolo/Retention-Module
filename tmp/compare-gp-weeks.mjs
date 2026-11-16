import fs from "fs";
import nextEnv from "@next/env";
import XLSX from "xlsx";
import mysql from "mysql2/promise";

nextEnv.loadEnvConfig(process.cwd());

const LABELS = {
  mileage: "MILEAGE",
  gross: "TOTAL GROSS INCOME",
  pay: "Driver's pay",
  fuel: "Fuel",
  prepass: "PREPASS",
};

function num(v) {
  if (v == null || v === "" || v === "-") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseSheet(file, week) {
  const buf = fs.readFileSync(file);
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  const cards = [];
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c += 5) {
      const name = row[c];
      const id = row[c + 1];
      if (typeof name !== "string") continue;
      const label = name.trim();
      if (!label || label === "RATE $" || Object.values(LABELS).includes(label)) continue;
      if (label.startsWith("TOTAL") || label === "EXPENSES" || label === "GROSS PROFIT") continue;
      const next = rows[r + 1]?.[c];
      if (String(next || "").trim() !== "RATE $") continue;
      const block = {};
      for (let k = 1; k <= 21 && r + k < rows.length; k++) {
        const lab = String(rows[r + k]?.[c] || "").trim();
        if (!lab) continue;
        block[lab] = {
          a: rows[r + k]?.[c + 1] ?? null,
          b: rows[r + k]?.[c + 2] ?? null,
          calc: rows[r + k]?.[c + 3] ?? null,
        };
      }
      cards.push({
        week,
        name: label,
        sheetId: num(id),
        mileage: num(block[LABELS.mileage]?.a),
        gross: num(block[LABELS.gross]?.a),
        pay: num(block[LABELS.pay]?.a),
        mpg: num(block[LABELS.fuel]?.a),
        ppg: num(block[LABELS.fuel]?.b),
        fuel: num(block[LABELS.fuel]?.calc),
        prepass: num(block[LABELS.prepass]?.a),
      });
    }
  }
  return cards;
}

const sheet = [
  ...parseSheet("D:/azfs/grossProfit/tmp/W42.xlsx", 42),
  ...parseSheet("D:/azfs/grossProfit/tmp/W43.xlsx", 43),
];
console.log("SHEET_CARDS", sheet.length, "w42", sheet.filter((s) => s.week === 42).length, "w43", sheet.filter((s) => s.week === 43).length);

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [dbRows] = await conn.query(
  `SELECT year, week, driver_id, driver_name, driver_type, mileage, gross_income,
          drivers_pay, fuel, fuel_mpg, fuel_ppg, prepass
     FROM gross_profit_reports
    WHERE year = 2026 AND week IN (42, 43)`
);
console.log("DB_ROWS", dbRows.length);
const weeks = {};
for (const r of dbRows) weeks[r.week] = (weeks[r.week] || 0) + 1;
console.log("DB_BY_WEEK", JSON.stringify(weeks));

function keyName(s) {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

const dbByWeekId = new Map();
const dbByWeekName = new Map();
for (const r of dbRows) {
  dbByWeekId.set(`${r.week}:${r.driver_id}`, r);
  const n = keyName(r.driver_name);
  const last = n.split(" ").slice(-1)[0];
  dbByWeekName.set(`${r.week}:${n}`, r);
  if (!dbByWeekName.has(`${r.week}:last:${last}`)) {
    dbByWeekName.set(`${r.week}:last:${last}`, r);
  } else {
    dbByWeekName.set(`${r.week}:last:${last}`, null);
  }
}

function close(a, b, tol) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(a - b) <= tol;
}

const mismatches = [];
const unmatched = [];
const matchedIds = new Set();
for (const s of sheet) {
  let db =
    (s.sheetId != null && dbByWeekId.get(`${s.week}:${s.sheetId}`)) ||
    null;
  let how = db ? "id" : "";
  if (!db) {
    const last = keyName(s.name);
    db = dbByWeekName.get(`${s.week}:${last}`) || dbByWeekName.get(`${s.week}:last:${last}`);
    if (db) how = "name";
  }
  if (!db) {
    unmatched.push({ week: s.week, name: s.name, sheetId: s.sheetId });
    continue;
  }
  matchedIds.add(`${db.week}:${db.driver_id}`);
  const fields = [
    ["mileage", s.mileage, Number(db.mileage), 1],
    ["gross", s.gross, Number(db.gross_income), 1],
    ["pay", s.pay, Number(db.drivers_pay), 1],
    ["prepass", s.prepass, Number(db.prepass), 1],
    ["mpg", s.mpg, db.fuel_mpg == null ? null : Number(db.fuel_mpg), 0.05],
    ["ppg", s.ppg, db.fuel_ppg == null ? null : Number(db.fuel_ppg), 0.05],
  ];
  const diffs = [];
  for (const [field, sheetV, dbV, tol] of fields) {
    if (!close(sheetV, dbV, tol)) {
      diffs.push({
        field,
        sheet: sheetV,
        db: dbV == null ? null : Math.round(dbV * 100) / 100,
        delta: sheetV == null || dbV == null ? null : Math.round((dbV - sheetV) * 100) / 100,
      });
    }
  }
  if (diffs.length) {
    mismatches.push({
      week: s.week,
      name: s.name,
      dbName: db.driver_name,
      id: db.driver_id,
      type: db.driver_type,
      how,
      diffs,
    });
  }
}

const dbOnly = dbRows
  .filter((r) => !matchedIds.has(`${r.week}:${r.driver_id}`))
  .filter((r) => Number(r.mileage) > 0 || Number(r.gross_income) > 0)
  .map((r) => ({
    week: r.week,
    id: r.driver_id,
    name: r.driver_name,
    mileage: Number(r.mileage),
    gross: Number(r.gross_income),
  }));

const byField = {};
for (const m of mismatches) {
  for (const d of m.diffs) {
    byField[d.field] = (byField[d.field] || 0) + 1;
  }
}
console.log("MATCHED", matchedIds.size, "MISMATCH_DRIVERS", mismatches.length, "UNMATCHED_SHEET", unmatched.length, "DB_ONLY_WITH_ACTIVITY", dbOnly.length);
console.log("BY_FIELD", JSON.stringify(byField));
fs.writeFileSync(
  "D:/azfs/grossProfit/tmp/gp-compare.json",
  JSON.stringify({ mismatches, unmatched, dbOnly }, null, 2)
);
console.log("WROTE tmp/gp-compare.json");
await conn.end();
process.exit(0);
