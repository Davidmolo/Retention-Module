import nextEnv from '@next/env';
import mysql from 'mysql2/promise';

nextEnv.loadEnvConfig(process.cwd());
const p = await mysql.createPool(process.env.DATABASE_URL);

const names = [
  'Chambers',
  'Crayton',
  'Liobikas',
  'Nedeljkovic',
  'Meighan',
  'Turner',
  'Martin',
  'Waden',
  'Ilunga',
  'Meneilly',
  'Roberson',
  'Stewart',
  'Elias',
  'Washington',
  'Jurevicius',
  'Britton',
  'Evariste',
  'Mcginnis',
  'Mcgrew',
  'Cline',
  'Norton',
  'Ores',
  'Graham',
  'Frederic',
];

const [rows] = await p.query(
  `SELECT r.driver_id, r.driver_name, r.driver_status, r.driver_type, r.unit,
          r.mileage, r.gross_income, r.drivers_pay, r.fuel_ppg, r.fuel_mpg, r.fuel,
          r.trips, d.status AS live_status, d.driver_type AS live_type
     FROM gross_profit_reports r
     LEFT JOIN drivers d ON d.id = r.driver_id
    WHERE r.year = 2026 AND r.week = 43
      AND (
        ${names.map(() => `r.driver_name LIKE ?`).join(' OR ')}
      )
    ORDER BY r.driver_name`,
  names.map((n) => `%${n}%`)
);

console.log('=== W43 GP rows matching Mantas names ===');
for (const r of rows) {
  console.log({
    id: r.driver_id,
    name: r.driver_name,
    snapStatus: r.driver_status,
    liveStatus: r.live_status,
    unit: r.unit,
    mi: Number(r.mileage),
    gross: Number(r.gross_income),
    pay: Number(r.drivers_pay),
    ppg: Number(r.fuel_ppg),
    mpg: Number(r.fuel_mpg),
    fuel: Number(r.fuel),
    trips: Number(r.trips),
  });
}

// All W43 with non-active live or snapshot status
const [term] = await p.query(
  `SELECT r.driver_id, r.driver_name, r.driver_status, d.status AS live_status,
          r.mileage, r.gross_income, r.drivers_pay, r.trips
     FROM gross_profit_reports r
     LEFT JOIN drivers d ON d.id = r.driver_id
    WHERE r.year=2026 AND r.week=43
      AND (
        LOWER(COALESCE(r.driver_status,'')) NOT IN ('active')
        OR LOWER(COALESCE(d.status,'')) NOT IN ('active')
      )
    ORDER BY r.driver_name`
);
console.log('\n=== W43 rows where snap or live status != active ===');
for (const r of term) {
  console.log({
    name: r.driver_name,
    snap: r.driver_status,
    live: r.live_status,
    mi: Number(r.mileage),
    gross: Number(r.gross_income),
    pay: Number(r.drivers_pay),
    trips: Number(r.trips),
  });
}

// How getWeeklySummary filters status - check stored zeros
const [zeros] = await p.query(
  `SELECT driver_name, driver_status, mileage, gross_income, drivers_pay, trips
     FROM gross_profit_reports
    WHERE year=2026 AND week=43
      AND COALESCE(mileage,0)=0 AND COALESCE(gross_income,0)=0 AND COALESCE(trips,0)=0
    ORDER BY driver_name`
);
console.log('\n=== W43 zero activity rows ===', zeros.length);
for (const r of zeros) console.log(r.driver_name, r.driver_status);

await p.end();
