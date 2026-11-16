import fs from "fs";
const data = JSON.parse(fs.readFileSync("tmp/gp-compare-fixed.json", "utf8"));
const core = data.mismatches.filter((m) =>
  m.diffs.some((d) => ["mileage", "gross", "pay"].includes(d.field))
);
console.log("core", core.length);
const payOnly = [];
const milesGross = [];
for (const m of core) {
  const fields = m.diffs.filter((d) => ["mileage", "gross", "pay"].includes(d.field));
  const line = `W${m.week} ${m.dbName} ${m.id} ${m.type} ` + fields
    .map((d) => `${d.field} ${d.sheet}→${d.db} (${d.delta > 0 ? "+" : ""}${d.delta})`)
    .join("; ");
  const hasMiles = fields.some((d) => d.field === "mileage");
  const hasGross = fields.some((d) => d.field === "gross");
  if (!hasMiles && !hasGross) payOnly.push(line);
  else milesGross.push({ abs: Math.max(...fields.map((d) => Math.abs(d.delta || 0))), line });
}
milesGross.sort((a, b) => b.abs - a.abs);
console.log("\nMILES OR GROSS", milesGross.length);
for (const r of milesGross) console.log(r.line);
console.log("\nPAY ONLY", payOnly.length);
for (const l of payOnly) console.log(l);
console.log("\nunmatched", data.unmatched);
console.log("dbonly", data.dbOnly);
