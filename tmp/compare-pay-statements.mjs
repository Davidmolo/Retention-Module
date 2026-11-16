import fs from "fs";
import nextEnv from "@next/env";
import XLSX from "xlsx";
import mysql from "mysql2/promise";

nextEnv.loadEnvConfig(process.cwd());
const { listDriverPayStatementsForWeek } = await import(
  "../lib/openroad/driverPayStatements.ts"
);

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
      if (String(rows[r + 1]?.[c] || "").trim() !== "RATE $") continue;
      const block = {};
      for (let k = 1; k <= 18 && r + k < rows.length; k++) {
        if (k > 1 && String(rows[r + k + 1]?.[c] || "").trim() === "RATE $") break;
        const lab = String(rows[r + k]?.[c] || "").trim();
        if (!lab) continue;
        block[lab] = rows[r + k][c + 1] ?? null;
        if (lab === "GROSS PROFIT") break;
      }
      cards.push({
        week,
        name: name.trim(),
        oo: Object.prototype.hasOwnProperty.call(block, "XXII Fee"),
        mileage: num(block.MILEAGE),
        gross: num(block["TOTAL GROSS INCOME"]),
        pay: num(block["Driver's pay"]),
      });
    }
  }
  return cards;
}

let statements = [];
try {
  for (const week of [42, 43]) {
    const rows = await listDriverPayStatementsForWeek(2026, week);
    console.log(`W${week} statements`, rows.length);
    statements.push(...rows.map((r) => ({ ...r, week })));
  }
} catch (e) {
  console.log("PAY_STATEMENTS_BLOCKED");
  console.log(e.message.slice(0, 300));
  process.exit(2);
}

fs.writeFileSync("tmp/pay-statements-w42-w43.json", JSON.stringify(statements));
const sheet = [
  ...parseSheet("tmp/W42.xlsx", 42),
  ...parseSheet("tmp/W43.xlsx", 43),
];
const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [drivers] = await conn.query(
  `SELECT id, TRIM(CONCAT_WS(' ', first_name, last_name)) AS name FROM drivers`
);
await conn.end();
const nameById = new Map(drivers.map((d) => [Number(d.id), String(d.name || "").toLowerCase()]));

function close(a, b) {
  if (a == null || b == null) return false;
  return Math.abs(a - b) <= 1;
}

let miles = 0;
let pay = 0;
let grossAsLinehaul = 0;
let grossAsEarnings = 0;
let paired = 0;
for (const s of statements) {
  const name = nameById.get(Number(s.driver_id));
  const card = sheet.find(
    (c) => c.week === s.week && name && c.name.toLowerCase() === name
  );
  if (!card) continue;
  paired += 1;
  if (close(card.mileage, num(s.total_paid_miles))) miles += 1;
  if (!card.oo && close(card.pay, num(s.earnings))) pay += 1;
  if (close(card.gross, num(s.linehaul))) grossAsLinehaul += 1;
  if (close(card.gross, num(s.earnings))) grossAsEarnings += 1;
}
console.log(
  JSON.stringify({ paired, miles, pay, grossAsLinehaul, grossAsEarnings, statements: statements.length })
);
