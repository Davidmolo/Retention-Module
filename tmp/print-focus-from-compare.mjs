import fs from 'fs';
const { mismatches } = JSON.parse(fs.readFileSync('tmp/gp-compare.json', 'utf8'));

const focus = [
  'chambers',
  'meighan',
  'mcgrew',
  'nedeljkovic',
  'evariste',
  'roberson',
  'crayton',
  'elias',
  'turner',
  'moreland',
  'kincaid',
  'brittain',
  'gilbert',
];

const core = new Set(['mileage', 'gross', 'pay', 'ppg']);

for (const week of [43, 42]) {
  console.log(`\n# W${week} focus (from Mantas xlsx vs current DB)`);
  for (const key of focus) {
    const m = mismatches.find(
      (x) =>
        x.week === week &&
        String(x.dbName || x.name).toLowerCase().includes(key)
    );
    if (!m) {
      console.log(`${key}: FULL MATCH (or not on sheet)`);
      continue;
    }
    const diffs = m.diffs.filter((d) => core.has(d.field));
    const soft = m.diffs.filter((d) => !core.has(d.field));
    if (!diffs.length && !soft.length) {
      console.log(`${m.dbName}: FULL MATCH`);
      continue;
    }
    const bits = [...diffs, ...soft]
      .map(
        (d) =>
          `${d.field}: sheet ${d.sheet} → db ${d.db} (Δ${d.delta})`
      )
      .join(' | ');
    console.log(`${m.dbName}: ${bits}`);
  }
}
