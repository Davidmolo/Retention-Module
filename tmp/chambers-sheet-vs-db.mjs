import fs from 'fs';
import nextEnv from '@next/env';
import XLSX from 'xlsx';
import mysql from 'mysql2/promise';

nextEnv.loadEnvConfig(process.cwd());

function num(v) {
  if (v == null || v === '' || v === '-') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseDriver(file, week, want) {
  const buf = fs.readFileSync(file);
  const wb = XLSX.read(buf, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  const wantL = want.toLowerCase();
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c += 5) {
      const name = row[c];
      if (typeof name !== 'string') continue;
      if (!name.toLowerCase().includes(wantL)) continue;
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
      return {
        week,
        name: name.trim(),
        mileage: num(block['MILEAGE']?.a),
        gross: num(block['TOTAL GROSS INCOME']?.a),
        pay: num(block["Driver's pay"]?.a),
        mpg: num(block['Fuel']?.a),
        ppg: num(block['Fuel']?.b),
        fuel: num(block['Fuel']?.calc),
        prepass: num(block['PREPASS']?.a),
      };
    }
  }
  return null;
}

const p = await mysql.createConnection(process.env.DATABASE_URL);
for (const week of [42, 43]) {
  const sheet = parseDriver(
    `D:/azfs/grossProfit/tmp/W${week}.xlsx`,
    week,
    'Chambers'
  );
  const [db] = await p.query(
    `SELECT mileage, gross_income, drivers_pay, fuel_mpg, fuel_ppg, fuel, prepass
       FROM gross_profit_reports
      WHERE year=2026 AND week=? AND driver_id=24215`,
    [week]
  );
  const r = db[0];
  console.log(`\n=== Chambers W${week} ===`);
  console.log('sheet', sheet);
  console.log('db', {
    mileage: Number(r?.mileage),
    gross: Number(r?.gross_income),
    pay: Number(r?.drivers_pay),
    mpg: Number(r?.fuel_mpg),
    ppg: Number(r?.fuel_ppg),
    fuel: Number(r?.fuel),
    prepass: Number(r?.prepass),
  });
  if (sheet && r) {
    console.log('deltas', {
      mileage: Number(r.mileage) - sheet.mileage,
      gross: Number(r.gross_income) - sheet.gross,
      pay: Number(r.drivers_pay) - sheet.pay,
      mpg: Number(r.fuel_mpg) - sheet.mpg,
      ppg: Number(r.fuel_ppg) - sheet.ppg,
      fuel: Number(r.fuel) - sheet.fuel,
    });
  }
}
await p.end();
