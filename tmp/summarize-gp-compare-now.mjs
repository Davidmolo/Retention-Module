import fs from 'fs';

const data = JSON.parse(fs.readFileSync('tmp/gp-compare.json', 'utf8'));
const mismatches = data.mismatches || data;

const focusNames = [
  'Chambers',
  'Meighan',
  'Mcgrew',
  'Nedeljkovic',
  'Evariste',
  'Roberson',
  'Crayton',
  'Elias',
  'Turner',
  'Moreland',
  'Kincaid',
  'Brittain',
  'Gilbert',
  'Jurevicius',
];

function matchesFocus(name) {
  const n = String(name || '').toLowerCase();
  return focusNames.some((f) => n.includes(f.toLowerCase()));
}

const coreFields = new Set(['mileage', 'gross', 'pay', 'ppg']);
const tol = { mileage: 2, gross: 1, pay: 1, ppg: 0.02, mpg: 0.15, prepass: 1, fuel: 5 };

function meaningful(d) {
  const t = tol[d.field] ?? 0.5;
  return Math.abs(d.delta) > t;
}

const w43 = mismatches.filter((m) => m.week === 43);
const w42 = mismatches.filter((m) => m.week === 42);

function summarize(list, label) {
  const core = [];
  const soft = [];
  for (const m of list) {
    const diffs = (m.diffs || []).filter(meaningful);
    if (!diffs.length) continue;
    const c = diffs.filter((d) => coreFields.has(d.field));
    const s = diffs.filter((d) => !coreFields.has(d.field));
    if (c.length) core.push({ ...m, diffs: c });
    else if (s.length) soft.push({ ...m, diffs: s });
  }
  console.log(`\n======== ${label} CORE (mi/gross/pay/ppg) — ${core.length} drivers ========`);
  for (const m of core.sort((a, b) => a.dbName.localeCompare(b.dbName))) {
    const bits = m.diffs
      .map(
        (d) =>
          `${d.field}: sheet ${d.sheet} | db ${d.db} | Δ ${Number(d.delta).toFixed(2)}`
      )
      .join(' ; ');
    const mark = matchesFocus(m.dbName || m.name) ? ' ★' : '';
    console.log(`W${m.week} ${m.dbName}${mark}: ${bits}`);
  }
  console.log(`\n======== ${label} soft only (mpg/prepass/fuel) — ${soft.length} ========`);
  // only print focus soft
  for (const m of soft.filter((x) => matchesFocus(x.dbName || x.name))) {
    const bits = m.diffs
      .map(
        (d) =>
          `${d.field}: sheet ${d.sheet} | db ${d.db} | Δ ${Number(d.delta).toFixed(2)}`
      )
      .join(' ; ');
    console.log(`W${m.week} ${m.dbName}: ${bits}`);
  }
}

summarize(w43, 'W43');
summarize(w42, 'W42');

// Chambers exact
const chambers = mismatches.filter((m) =>
  String(m.dbName || m.name).toLowerCase().includes('chambers')
);
console.log('\n======== CHAMBERS DETAIL ========');
console.log(JSON.stringify(chambers, null, 2));

// PPG field across W43
const ppg = w43
  .map((m) => ({
    name: m.dbName,
    d: (m.diffs || []).find((x) => x.field === 'ppg'),
  }))
  .filter((x) => x.d && Math.abs(x.d.delta) > 0.02);
console.log('\n======== W43 PPG gaps > $0.02 ========');
for (const x of ppg) {
  console.log(
    `${x.name}: sheet ${x.d.sheet} | db ${x.d.db} | Δ ${x.d.delta}`
  );
}

console.log('\ncounts', {
  mismatchDrivers: mismatches.length,
  w43: w43.length,
  w42: w42.length,
  unmatchedSheet: data.unmatchedSheet?.length ?? data.unmatched_sheet?.length,
});
