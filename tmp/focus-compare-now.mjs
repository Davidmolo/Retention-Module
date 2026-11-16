import fs from "fs";
import nextEnv from "@next/env";
import XLSX from "xlsx";
import mysql from "mysql2/promise";

nextEnv.loadEnvConfig(process.cwd());

const FOCUS = [
  ["Chambers", "CALVIN CHAMBERS"],
  ["Meighan", "Deandre Meighan"],
  ["Mcgrew", "Morgan Mcgrew"],
  ["Nedeljkovic", "Daniel Nedeljkovic"],
  ["Evariste", "Maxwell Evariste"],
  ["Roberson", "Jeffery Roberson"],
  ["Crayton", "Carlos Crayton"],
  ["Elias", "Kristopher Solano Elias"],
  ["Turner", "Devin Turner"],
  ["Moreland", "Robert Moreland"],
  ["Kincaid", "Jerome Kincaid"],
  ["Brittain", "Chris Brittain"],
  ["Gilbert", "Michael Gilbert"],
  ["Smith", "Lyndon Smith"],
];

function num(v) {
  if (v == null || v === "" || v === "-") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseSheet(file, week) {
  const buf = fs.readFileSync(file);
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    raw: true,
    defval: null,
  });
  const out = [];
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c += 5) {
      const name = row[c];
      if (typeof name !== "string") continue;
      if (String(rows[r + 1]?.[c] || "").trim() !== "RATE $") continue;
      const block = {};
      for (let k = 1; k <= 25 && r + k < rows.length; k++) {
        const lab = String(rows[r + k]?.[c] || "").trim();
        if (!lab) continue;
        block[lab] = {
          a: rows[r + k]?.[c + 1] ?? null,
          b: rows[r + k]?.[c + 2] ?? null,
          calc: rows[r + k]?.[c + 3] ?? null,
        };
      }
      out.push({
        week,
        name: name.trim(),
        mileage: num(block["MILEAGE"]?.a),
        gross: num(block["TOTAL GROSS INCOME"]?.a),
        pay: num(block["Driver's pay"]?.a),
        mpg: num(block["Fuel"]?.a),
        ppg: num(block["Fuel"]?.b),
        fuel: num(block["Fuel"]?.calc),
        prepass: num(block["PREPASS"]?.a),
      });
    }
  }
  return out;
}

const w43Path = "tmp/W43.xlsx";
const w42Path = fs.existsSync("tmp/W42.xlsx") ? "tmp/W42.xlsx" : null;
const sheets = [...parseSheet(w43Path, 43)];
if (w42Path) sheets.push(...parseSheet(w42Path, 42));
console.error("sheet cards", sheets.length, "w43", sheets.filter((s) => s.week === 43).length);

const p = await mysql.createConnection(process.env.DATABASE_URL);
const [dbRows] = await p.query(
  `SELECT week, driver_name, mileage, gross_income, drivers_pay, fuel_mpg, fuel_ppg, fuel, prepass
     FROM gross_profit_reports WHERE year=2026 AND week IN (42,43)`
);
await p.end();

function findSheet(week, key) {
  const k = key.toLowerCase();
  return sheets.find(
    (s) => s.week === week && s.name.toLowerCase().includes(k)
  );
}
function findDb(week, full) {
  const f = full.toLowerCase();
  const last = full.split(/\s+/).pop().toLowerCase();
  return (
    dbRows.find(
      (r) => r.week === week && String(r.driver_name).toLowerCase() === f
    ) ||
    dbRows.find(
      (r) =>
        r.week === week && String(r.driver_name).toLowerCase().includes(last)
    )
  );
}

const TOL = { mi: 2, gross: 1, pay: 1, ppg: 0.02, mpg: 0.15, prepass: 1 };
const matchCount = { n: 0 };
const gapCount = { n: 0 };
const gapDrivers = [];
const weeksOut = {};

for (const week of [43, ...(w42Path ? [42] : [])]) {
  weeksOut[week] = [];
  for (const [key, full] of FOCUS) {
    const s = findSheet(week, key);
    const d = findDb(week, full);
    if (!s || !d) {
      weeksOut[week].push({ name: full, missing: !s ? "sheet" : "db" });
      continue;
    }
    const fields = [
      ["mi", s.mileage, Number(d.mileage)],
      ["gross", s.gross, Number(d.gross_income)],
      ["pay", s.pay, Number(d.drivers_pay)],
      ["ppg", s.ppg, Number(d.fuel_ppg)],
      ["mpg", s.mpg, Number(d.fuel_mpg)],
      ["prepass", s.prepass, Number(d.prepass)],
    ];
    const gaps = [];
    const ok = [];
    for (const [f, sheet, db] of fields) {
      if (sheet == null || db == null || !Number.isFinite(db)) continue;
      const delta = Math.round((db - sheet) * 100) / 100;
      const item = { f, sheet, db: Math.round(db * 10000) / 10000, delta };
      if (Math.abs(delta) > TOL[f]) gaps.push(item);
      else ok.push(item);
    }
    weeksOut[week].push({ name: full, gaps, ok });
    if (!gaps.length) matchCount.n++;
    else {
      gapCount.n++;
      gapDrivers.push(`W${week} ${full}`);
    }
  }
}

const report = {
  summary: { match: matchCount.n, gap: gapCount.n, gapDrivers },
  weeks: weeksOut,
};
fs.writeFileSync("tmp/focus-compare-now.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
