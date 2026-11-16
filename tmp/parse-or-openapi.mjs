import fs from "fs";
const t = fs.readFileSync("tmp/or-openapi.yaml", "utf8");
const lines = t.split("\n");
const paths = [];
let inPaths = false;
for (const line of lines) {
  if (line === "paths:") {
    inPaths = true;
    continue;
  }
  if (inPaths && /^[a-zA-Z]/.test(line)) break;
  if (inPaths && line.startsWith("  /") && line.endsWith(":")) {
    paths.push(line.trim().slice(0, -1));
  }
}
console.log("PATHS", paths.length);
for (const p of paths) console.log(p);

// keywords relevant to GP / Mantas settlement
const keys = [
  "pay",
  "settlement",
  "linehaul",
  "fuel",
  "load",
  "route",
  "financial",
  "statement",
  "accessorial",
  "detention",
  "toll",
  "driver",
  "compensat",
];
console.log("\n--- relevant path snippets ---");
for (const p of paths) {
  const pl = p.toLowerCase();
  if (keys.some((k) => pl.includes(k))) console.log(p);
}

// extract short descriptions near pay/settlement/fuel/financial
const chunks = t.split(/\n  \//);
for (const c of chunks) {
  const name = "/" + c.split("\n")[0].replace(/:$/, "");
  const low = c.toLowerCase();
  if (
    /pay.?statement|settlement|fuel_card|load_financial|driver_route|linehaul|accessorial/.test(
      low
    ) ||
    /\/driver_pay|\/fuel|\/load_financial|\/driver_route/.test(name)
  ) {
    const summary = (c.match(/summary:\s*(.+)/) || [])[1];
    const desc = (c.match(/description:\s*\|?\s*\n((?:\s{6,}.+\n)+)/) || [])[1];
    console.log("\n##", name);
    if (summary) console.log("summary:", summary.trim());
    if (desc)
      console.log(
        "desc:",
        desc
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean)
          .slice(0, 8)
          .join(" ")
      );
  }
}
