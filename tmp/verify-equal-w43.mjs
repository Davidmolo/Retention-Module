import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
import mysql from "mysql2/promise";
import XLSX from "xlsx";

const p = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await p.query(
  `SELECT driver_name, mileage, gross_income, drivers_pay, prepass
   FROM gross_profit_reports WHERE year=2026 AND week=43`
);
await p.end();

const wb = XLSX.readFile("tmp/W43.xlsx");
const ws = wb.Sheets[wb.SheetNames[0]];
const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

function numNear(r, label) {
  for (let u = Math.max(0, r - 20); u <= r + 15; u++) {
    const row = raw[u] || [];
    for (let j = 0; j < row.length; j++) {
      if (
        typeof row[j] === "string" &&
        row[j].toUpperCase().includes(label)
      ) {
        const a = Number(row[j + 1]);
        if (!Number.isNaN(a)) return a;
      }
    }
  }
  return null;
}

const cards = [];
for (let r = 0; r < raw.length; r++) {
  for (let c = 0; c < (raw[r]?.length || 0); c++) {
    const v = raw[r][c];
    if (typeof v !== "string" || !/TOTAL GROSS INCOME/i.test(v)) continue;
    let name = null;
    for (let u = r; u >= Math.max(0, r - 25); u--) {
      const row = raw[u] || [];
      for (let j = 0; j < row.length; j++) {
        if (
          typeof row[j] === "string" &&
          /DRIVER/i.test(row[j]) &&
          row[j + 1] &&
          !name
        ) {
          name = String(row[j + 1]);
        }
      }
    }
    cards.push({
      name,
      gross: numNear(r, "TOTAL GROSS"),
      mi: numNear(r, "MILEAGE"),
      pay:
        numNear(r, "DRIVER'S PAY") ||
        numNear(r, "DRIVERS PAY") ||
        numNear(r, "Driver's pay"),
      prepass: numNear(r, "PREPASS"),
    });
  }
}

function findSheet(dbName) {
  const last = dbName.toLowerCase().split(/\s+/).pop();
  return (
    cards.find((c) => (c.name || "").toLowerCase().includes(last)) || null
  );
}

const focus = [
  "meighan",
  "crayton",
  "elias",
  "roberson",
  "evariste",
  "turner",
  "chambers",
];
for (const key of focus) {
  const db = rows.find((r) => String(r.driver_name).toLowerCase().includes(key));
  if (!db) {
    console.log(key, "NO DB");
    continue;
  }
  const s = findSheet(db.driver_name);
  if (!s) {
    console.log(db.driver_name, "NO SHEET");
    continue;
  }
  const line = (label, sheet, gp) => {
    const d = Number(gp) - Number(sheet || 0);
    return `  ${label} sheet ${sheet} gp ${Number(gp)} d ${d.toFixed(2)}`;
  };
  console.log(db.driver_name);
  console.log(line("gross", s.gross, db.gross_income));
  console.log(line("mi   ", s.mi, db.mileage));
  console.log(line("pay  ", s.pay, db.drivers_pay));
  console.log(line("prep ", s.prepass, db.prepass));
}
