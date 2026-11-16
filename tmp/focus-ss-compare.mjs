import fs from 'fs';
import nextEnv from '@next/env';
import XLSX from 'xlsx';
import mysql from 'mysql2/promise';

nextEnv.loadEnvConfig(process.cwd());

const FOCUS = [
  ['Chambers', 'CALVIN CHAMBERS'],
  ['Meighan', 'Deandre Meighan'],
  ['Mcgrew', 'Morgan Mcgrew'],
  ['Nedeljkovic', 'Daniel Nedeljkovic'],
  ['Evariste', 'Maxwell Evariste'],
  ['Roberson', 'Jeffery Roberson'],
  ['Crayton', 'Carlos Crayton'],
  ['Elias', 'Kristopher Solano Elias'],
  ['Turner', 'Devin Turner'],
  ['Moreland', 'Robert Moreland'],
  ['Kincaid', 'Jerome Kincaid'],
  ['Brittain', 'Chris Brittain'],
  ['Gilbert', 'Michael Gilbert'],
];

function num(v) {
  if (v == null || v === '' || v === '-') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseSheet(file, week) {
  const buf = fs.readFileSync(file);
  const wb = XLSX.read(buf, { type: 'buffer' });
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
      if (typeof name !== 'string') continue;
      if (String(rows[r + 1]?.[c] || '').trim() !== 'RATE $') continue;
      const block = {};
      for (let k = 1; k <= 25 && r + k < rows.length; k++) {
        const lab = String(rows[r + k]?.[c] || '').trim();
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
        mileage: num(block['MILEAGE']?.a),
        gross: num(block['TOTAL GROSS INCOME']?.a),
        pay: num(block["Driver's pay"]?.a),
        mpg: num(block['Fuel']?.a),
        ppg: num(block['Fuel']?.b),
        fuel: num(block['Fuel']?.calc),
        prepass: num(block['PREPASS']?.a),
      });
    }
  }
  return out;
}

const sheets = [
  ...parseSheet('D:/azfs/grossProfit/tmp/W42.xlsx', 42),
  ...parseSheet('D:/azfs/grossProfit/tmp/W43.xlsx', 43),
];

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
  return dbRows.find(
    (r) => r.week === week && String(r.driver_name).toLowerCase() === f
  );
}

function row(week, key, full) {
  const s = findSheet(week, key);
  const d = findDb(week, full);
  if (!s || !d) return { week, name: full, missing: !s ? 'sheet' : 'db' };
  const fields = [
    ['mi', s.mileage, Number(d.mileage), 2],
    ['gross', s.gross, Number(d.gross_income), 1],
    ['pay', s.pay, Number(d.drivers_pay), 1],
    ['ppg', s.ppg, Number(d.fuel_ppg), 0.02],
    ['mpg', s.mpg, Number(d.fuel_mpg), 0.15],
  ];
  const gaps = [];
  const ok = [];
  for (const [f, sheet, db, tol] of fields) {
    if (sheet == null || db == null || !Number.isFinite(db)) continue;
    const delta = db - sheet;
    const item = {
      f,
      sheet,
      db: Number(db.toFixed(4)),
      delta: Number(delta.toFixed(2)),
    };
    if (Math.abs(delta) > tol) gaps.push(item);
    else ok.push(item);
  }
  return { week, name: full, gaps, ok };
}

console.log('FOCUS_COMPARE');
for (const week of [43, 42]) {
  console.log(`\n## W${week}`);
  for (const [key, full] of FOCUS) {
    const r = row(week, key, full);
    if (r.missing) {
      console.log(`${full}: missing ${r.missing}`);
      continue;
    }
    if (!r.gaps.length) {
      console.log(`${full}: MATCH (mi/gross/pay/ppg/mpg)`);
      continue;
    }
    const bits = r.gaps
      .map((g) => `${g.f} sheet=${g.sheet} db=${g.db} Δ${g.delta}`)
      .join(' | ');
    const matched = r.ok.map((g) => g.f).join(',');
    console.log(`${full}: ${bits}${matched ? `  [ok: ${matched}]` : ''}`);
  }
}

// Screenshot target
const c43 = row(43, 'Chambers', 'CALVIN CHAMBERS');
console.log('\n## Screenshot fuel Net P/G target');
console.log(
  'Chambers W43 PPG sheet/db',
  c43.ok?.find((x) => x.f === 'ppg') || c43.gaps?.find((x) => x.f === 'ppg')
);
