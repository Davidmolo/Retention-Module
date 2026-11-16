import fs from "fs";
const data = JSON.parse(fs.readFileSync("D:/azfs/grossProfit/tmp/gp-compare.json", "utf8"));

function abs(n) {
  return n == null ? null : Math.abs(n);
}
const big = [];
for (const m of data.mismatches) {
  for (const d of m.diffs) {
    if (!["mileage", "gross", "pay"].includes(d.field)) continue;
    big.push({
      week: m.week,
      name: m.dbName || m.name,
      id: m.id,
      field: d.field,
      sheet: d.sheet,
      db: d.db,
      delta: d.delta,
      abs: abs(d.delta),
    });
  }
}
big.sort((a, b) => (b.abs || 0) - (a.abs || 0));
console.log("TOP 25 mileage/gross/pay");
for (const r of big.slice(0, 25)) {
  console.log(
    `W${r.week} ${r.name} (${r.id}) ${r.field} sheet=${r.sheet} db=${r.db} delta=${r.delta}`
  );
}

function stats(field) {
  const xs = [];
  for (const m of data.mismatches) {
    const d = m.diffs.find((x) => x.field === field);
    if (d && d.delta != null) xs.push(Math.abs(d.delta));
  }
  xs.sort((a, b) => a - b);
  const sum = xs.reduce((a, b) => a + b, 0);
  const p = (q) => xs[Math.min(xs.length - 1, Math.floor(q * (xs.length - 1)))] ?? 0;
  console.log(
    field,
    "n",
    xs.length,
    "median",
    Math.round(p(0.5) * 100) / 100,
    "p90",
    Math.round(p(0.9) * 100) / 100,
    "max",
    Math.round((xs[xs.length - 1] || 0) * 100) / 100,
    "mean",
    xs.length ? Math.round((sum / xs.length) * 100) / 100 : 0
  );
}
stats("mileage");
stats("gross");
stats("pay");
stats("prepass");
stats("mpg");

const both = data.mismatches.filter((m) =>
  ["mileage", "gross", "pay"].every((f) => m.diffs.some((d) => d.field === f))
);
const core = data.mismatches.filter((m) =>
  m.diffs.some((d) => ["mileage", "gross", "pay"].includes(d.field))
);
console.log("drivers with mileage AND gross AND pay off", both.length);
console.log("drivers with any of those three off", core.length);
console.log("UNMATCHED");
for (const u of data.unmatched) console.log(`W${u.week} ${u.name} sheetId=${u.sheetId}`);
console.log("DB ONLY");
for (const u of data.dbOnly) console.log(`W${u.week} ${u.name} (${u.id}) mi=${u.mileage} gross=${u.gross}`);

const small = { mileage: 0, gross: 0, pay: 0 };
for (const m of data.mismatches) {
  for (const d of m.diffs) {
    if (d.delta != null && Math.abs(d.delta) < 5 && small[d.field] != null) small[d.field] += 1;
  }
}
console.log("ABS_DELTA_UNDER_5", JSON.stringify(small));
