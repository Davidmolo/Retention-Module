import fs from 'fs';
import nextEnv from '@next/env';
import XLSX from 'xlsx';
import mysql from 'mysql2/promise';

nextEnv.loadEnvConfig(process.cwd());

const LABELS = {
  mileage: 'MILEAGE',
  gross: 'TOTAL GROSS INCOME',
  pay: "Driver's pay",
  fuel: 'Fuel',
  prepass: 'PREPASS',
  rm: 'R & M',
  totalExp: 'TOTAL EXPENSES',
  gp: 'GROSS PROFIT',
};

function num(v) {
  if (v == null || v === '' || v === '-') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseSheet(file) {
  const buf = fs.readFileSync(file);
  const wb = XLSX.read(buf, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c += 5) {
      const name = row[c];
      if (typeof name !== 'string') continue;
      const label = name.trim();
      if (!/moreland/i.test(label)) continue;
      const next = rows[r + 1]?.[c];
      if (String(next || '').trim() !== 'RATE $') continue;
      const block = { name: label, unit: num(row[c + 1]) };
      for (let k = 1; k <= 25 && r + k < rows.length; k++) {
        const lab = String(rows[r + k]?.[c] || '').trim();
        if (!lab) continue;
        block[lab] = {
          a: rows[r + k]?.[c + 1] ?? null,
          b: rows[r + k]?.[c + 2] ?? null,
          calc: rows[r + k]?.[c + 3] ?? null,
        };
      }
      return block;
    }
  }
  return null;
}

const sheet = parseSheet('tmp/W43.xlsx');
console.log('SHEET CARD KEYS', sheet && Object.keys(sheet));

const p = await mysql.createPool(process.env.DATABASE_URL);
const [db] = await p.query(
  `SELECT * FROM gross_profit_reports
    WHERE year=2026 AND week=43 AND driver_id=37820`
);
const d = db[0];
console.log('DB row found', !!d);

const fields = [
  ['mileage', LABELS.mileage, 'mileage', 'a'],
  ['gross', LABELS.gross, 'gross_income', 'a'],
  ['pay', LABELS.pay, 'drivers_pay', 'a'],
  ['mpg', LABELS.fuel, 'fuel_mpg', 'a'],
  ['ppg', LABELS.fuel, 'fuel_ppg', 'b'],
  ['fuel$', LABELS.fuel, 'fuel', 'calc'],
  ['prepass', LABELS.prepass, 'prepass', 'a'],
  ['rm', LABELS.rm, 'rm', 'a'],
  ['totalExp', LABELS.totalExp, 'total_expenses', 'a'],
  ['grossProfit', LABELS.gp, 'gross_profit', 'a'],
];

console.log('\n=== Moreland W43 sheet vs GP DB ===');
for (const [key, lab, col, side] of fields) {
  const sVal = num(sheet?.[lab]?.[side]);
  const dVal = num(d?.[col]);
  const delta =
    sVal != null && dVal != null ? Number((dVal - sVal).toFixed(2)) : null;
  console.log({
    field: key,
    sheet: sVal,
    db: dVal,
    delta,
  });
}

const paySheet = num(sheet?.[LABELS.pay]?.a);
const payDb = num(d?.drivers_pay);
console.log('\nAfter accepting missing $100 accessorial:');
console.log({
  sheet_pay: paySheet,
  db_pay: payDb,
  db_plus_100: payDb != null ? Number((payDb + 100).toFixed(2)) : null,
  remaining_pay_gap:
    paySheet != null && payDb != null
      ? Number((payDb + 100 - paySheet).toFixed(2))
      : null,
});

await p.end();
