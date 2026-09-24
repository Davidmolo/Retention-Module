// Seed SAMPLE trips so the "Top by Trips" chart has data before the real
// TMS/import feed exists. Idempotent (external_id). Safe to delete: rows have
// source='seed'. Replace with real data via insertTrips() from the TMS sync.
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());

const { insertTrips } = await import('../lib/sources/trips.ts');

const plan = [
  ['Christopher', 18],
  ['Ronnie Sieg', 14],
  ['Dilbagh Sin', 11],
  ['Earl', 9],
  ['Lanz', 6],
];

const rows = [];
for (const [driverName, count] of plan) {
  for (let i = 1; i <= count; i++) {
    const miles = 420 + ((i * 37) % 260); // deterministic 420–680 mi
    rows.push({
      externalId: `SEED-${driverName.replace(/\s+/g, '_')}-${i}`,
      driverName,
      tripDate: '2026-07-01',
      origin: 'Origin',
      destination: 'Destination',
      miles,
      revenue: Math.round(miles * 2.85 * 100) / 100, // ~$2.85/mi
      source: 'seed',
    });
  }
}

const n = await insertTrips(rows);
console.log(`Seeded ${rows.length} sample trips (affectedRows=${n}).`);
process.exit(0);
