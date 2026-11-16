import fs from "fs";
import nextEnv from "@next/env";
import XLSX from "xlsx";
import mysql from "mysql2/promise";

nextEnv.loadEnvConfig(process.cwd());

function num(v) {
  if (v == null || v === "" || v === "-" || v === "#DIV/0!") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseSheet(file, week) {
  const wb = XLSX.read(fs.readFileSync(file), { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
    header: 1,
    raw: true,
    defval: null,
  });
  const cards = [];
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c += 5) {
      const name = row[c];
      if (typeof name !== "string") continue;
      const label = name.trim();
      if (
        !label ||
        label === "RATE $" ||
        label === "EXPENSES" ||
        label.startsWith("TOTAL") ||
        label === "GROSS PROFIT"
      ) {
        continue;
      }
      if (String(rows[r + 1]?.[c] || "").trim() !== "RATE $") continue;
      const block = {};
      for (let k = 1; k <= 18 && r + k < rows.length; k++) {
        if (k > 1 && String(rows[r + k + 1]?.[c] || "").trim() === "RATE $") break;
        const lab = String(rows[r + k]?.[c] || "").trim();
        if (!lab) continue;
        block[lab] = {
          a: rows[r + k][c + 1] ?? null,
          b: rows[r + k][c + 2] ?? null,
          calc: rows[r + k][c + 3] ?? null,
        };
        if (lab === "GROSS PROFIT") break;
      }
      const oo = Object.prototype.hasOwnProperty.call(block, "XXII Fee");
      const fuel = block.Fuel;
      cards.push({
        week,
        name: label,
        sheetId: num(row[c + 1]),
        oo,
        mileage: num(block.MILEAGE?.a),
        gross: num(block["TOTAL GROSS INCOME"]?.a),
        pay: num(block["Driver's pay"]?.a),
        mpg: oo ? null : num(fuel?.a),
        ppg: oo ? null : num(fuel?.b),
        fuel: oo ? num(fuel?.calc ?? fuel?.a) : num(fuel?.calc),
        prepass: num(block.PREPASS?.a),
      });
    }
  }
  return cards;
}

const sheet = [
  ...parseSheet("tmp/W42.xlsx", 42),
  ...parseSheet("tmp/W43.xlsx", 43),
];
console.log(
  "cards",
  sheet.length,
  "w42",
  sheet.filter((s) => s.week === 42).length,
  "w43",
  sheet.filter((s) => s.week === 43).length
);

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [dbRows] = await conn.query(
  `SELECT year, week, driver_id, driver_name, driver_type, mileage, gross_income,
          drivers_pay, fuel, fuel_mpg, fuel_ppg, prepass
     FROM gross_profit_reports
    WHERE year = 2026 AND week IN (42, 43)`
);
await conn.end();

const ALIAS = {
  "t. moore": "teairre moore",
  gillet: "paul gillett",
  parra: "juan parra jr.",
  "s. thomas": "sedric thomas",
  "l. smith": "lyndon smith",
  smith: "donald smith",
  "pma/singh": "manpreet singh",
  "p. meneilly": "paul meneilly",
  "c. smith": "chevarres smith",
  houston: "kenneth houston",
};

function keyName(s) {
  const n = String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  return ALIAS[n] || n;
}
const dbByWeekName = new Map();
for (const r of dbRows) {
  const n = keyName(r.driver_name);
  const last = n.split(" ").slice(-1)[0];
  dbByWeekName.set(`${r.week}:${n}`, r);
  const lk = `${r.week}:last:${last}`;
  if (!dbByWeekName.has(lk)) dbByWeekName.set(lk, r);
  else dbByWeekName.set(lk, null);
}

function close(a, b, tol) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(a - b) <= tol;
}

const mismatches = [];
const unmatched = [];
const matched = new Set();
for (const s of sheet) {
  const last = keyName(s.name);
  const db =
    dbByWeekName.get(`${s.week}:${last}`) ||
    dbByWeekName.get(`${s.week}:last:${last}`);
  if (!db) {
    unmatched.push({
      week: s.week,
      name: s.name,
      sheetId: s.sheetId,
      mileage: s.mileage,
      gross: s.gross,
    });
    continue;
  }
  matched.add(`${db.week}:${db.driver_id}`);
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
    if (s.oo && (field === "pay" || field === "prepass" || field === "mpg" || field === "ppg")) {
      continue;
    }
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
      oo: s.oo,
      diffs,
    });
  }
}

const dbOnly = dbRows
  .filter((r) => !matched.has(`${r.week}:${r.driver_id}`))
  .filter((r) => Number(r.mileage) > 0 || Number(r.gross_income) > 0)
  .map((r) => ({
    week: r.week,
    id: r.driver_id,
    name: r.driver_name,
    mileage: Number(r.mileage),
    gross: Number(r.gross_income),
  }));

const by = {};
for (const m of mismatches) {
  for (const d of m.diffs) by[d.field] = (by[d.field] || 0) + 1;
}
const core = mismatches.filter((m) =>
  m.diffs.some((d) => d.field === "mileage" || d.field === "gross" || d.field === "pay")
);
console.log(
  "MATCHED",
  matched.size,
  "MISMATCH",
  mismatches.length,
  "CORE",
  core.length,
  "UNMATCHED",
  unmatched.length,
  "DBONLY",
  dbOnly.length
);
console.log("BY", JSON.stringify(by));

function top(field) {
  return mismatches
    .flatMap((m) => {
      const d = m.diffs.find((x) => x.field === field);
      if (!d || d.delta == null) return [];
      return [
        {
          week: m.week,
          name: m.dbName,
          id: m.id,
          type: m.type,
          sheet: d.sheet,
          db: d.db,
          delta: d.delta,
          miles: m.diffs.find((x) => x.field === "mileage")?.delta ?? null,
          pay: m.diffs.find((x) => x.field === "pay")?.delta ?? null,
        },
      ];
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 15);
}
console.log("TOP GROSS");
for (const r of top("gross")) {
  console.log(
    `W${r.week} ${r.name} ${r.id} ${r.type} sheet ${r.sheet} db ${r.db} d ${r.delta} miD ${r.miles} payD ${r.pay}`
  );
}
console.log("UNMATCHED");
for (const u of unmatched) {
  console.log(`W${u.week} ${u.name} id ${u.sheetId} mi ${u.mileage} g ${u.gross}`);
}
console.log("DBONLY");
for (const u of dbOnly) {
  console.log(`W${u.week} ${u.name} ${u.id} mi ${u.mileage} g ${u.gross}`);
}

const both = mismatches.filter((m) =>
  ["mileage", "gross"].every((f) => m.diffs.some((d) => d.field === f && d.delta != null))
);
const same = both.filter((m) => {
  const signs = ["mileage", "gross"].map((f) => Math.sign(m.diffs.find((d) => d.field === f).delta));
  return signs[0] !== 0 && signs[0] === signs[1];
});
console.log("miles AND gross off", both.length, "same direction", same.length);

fs.writeFileSync(
  "tmp/gp-compare-fixed.json",
  JSON.stringify({ mismatches, unmatched, dbOnly, by }, null, 2)
);
