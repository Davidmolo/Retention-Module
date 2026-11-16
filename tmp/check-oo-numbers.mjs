import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
import { getPool } from "../lib/db.ts";
import {
  isOwnerOperator,
  OWNER_OPERATOR_EXCEPTION_NAMES,
  ooFuelMode,
  ownerOperatorXxiiFee,
} from "../lib/sources/driverTypeGroups.ts";
import { getWeeklySummary } from "../lib/sources/weeklySummary.ts";
import { getOoOverridesByNameKey, lookupOoOverride } from "../lib/sources/gpConfig.ts";

const pool = getPool();

const [weeks] = await pool.query(`
  SELECT year, week, COUNT(*) AS n
  FROM gross_profit_reports
  GROUP BY year, week
  ORDER BY year DESC, week DESC
  LIMIT 5
`);
console.log("stored weeks", weeks);

const year = weeks[0].year;
const week = weeks[0].week;

const summary = await getWeeklySummary(year, week);
const oo = summary.drivers.filter((d) =>
  isOwnerOperator({ driverType: d.driverType, name: d.name })
);
const ooByName = await getOoOverridesByNameKey();

console.log(`\n=== Live W${week} ${year}: ${oo.length} OO of ${summary.drivers.length} ===\n`);

const issues = [];

for (const d of oo.sort((a, b) => a.name.localeCompare(b.name))) {
  const mode = ooFuelMode(d.name);
  const ov = lookupOoOverride(d.name, ooByName);
  const xxii = ownerOperatorXxiiFee(d.linehaulPct, d.grossIncome, ov?.xxiiFeePct ?? null);
  const rowIssues = [];

  if (mode === "zero" && Math.abs(d.fuel) > 0.01) {
    rowIssues.push(`fuel ${d.fuel} should be 0`);
  }
  if (d.grossIncome > 100 && !xxii) {
    rowIssues.push(`no XXII (pct=${d.linehaulPct}, ov=${ov?.xxiiFeePct ?? null})`);
  }
  if (xxii && xxii.feePct >= 50) {
    rowIssues.push(`XXII ${xxii.feePct}% looks like keep% not company cut`);
  }
  if (d.mileage > 100 && d.grossIncome === 0) {
    rowIssues.push(`miles ${d.mileage} but gross 0`);
  }
  if (d.grossIncome > 0 && d.mileage <= 0) {
    rowIssues.push(`gross ${d.grossIncome} with 0 miles`);
  }
  if (d.grossProfit < -1000) {
    rowIssues.push(`GP very negative ${d.grossProfit}`);
  }
  if (mode === "per_gallon_fee" && d.fuel > 400) {
    rowIssues.push(`gal-fee fuel ${d.fuel} unusually high`);
  }
  if ((mode === "retail_paid" || mode === "wagner") && d.fuelGross > 0) {
    // fuel should be positive savings typically
    if (d.fuel < -1) rowIssues.push(`negative savings fuel ${d.fuel}`);
  }
  // XXII + fuel - exp should equal gp
  const expectGp = Math.round(((xxii?.feeAmount ?? 0) + d.fuel - d.totalExpenses) * 100) / 100;
  if (Math.abs(expectGp - d.grossProfit) > 1) {
    rowIssues.push(`GP ${d.grossProfit} != xxii+fuel-exp ${expectGp}`);
  }

  console.log(
    JSON.stringify({
      name: d.name,
      type: d.driverType,
      mode,
      miles: d.mileage,
      gross: d.grossIncome,
      fuel: d.fuel,
      fuelGross: d.fuelGross,
      fuelDisc: d.fuelDiscounted,
      pct: d.linehaulPct,
      xxiiPct: xxii?.feePct ?? null,
      xxii: xxii?.feeAmount ?? 0,
      rm: d.rm,
      lease: d.equipmentLease,
      liab: d.liabilityInsurance,
      cargo: d.cargoInsurance,
      fact: d.factoringFee,
      pd: d.pdInsurance,
      exp: d.totalExpenses,
      gp: d.grossProfit,
      ov: ov
        ? { xxii: ov.xxiiFeePct, pd: ov.pdInsurance, liabC: ov.liabilityCredit, lease: ov.equipmentLease }
        : null,
    })
  );
  if (rowIssues.length) issues.push({ name: d.name, issues: rowIssues });
}

console.log("\n=== FLAGGED W" + week + " ===");
if (!issues.length) console.log("(none)");
for (const i of issues) console.log(`• ${i.name}: ${i.issues.join(" | ")}`);

console.log("\n=== exceptions ===");
for (const ex of OWNER_OPERATOR_EXCEPTION_NAMES) {
  const hit = summary.drivers.find((d) => {
    const t = d.name.toLowerCase();
    const p = ex.toLowerCase().split(/\s+/);
    return t.startsWith(p[0]) && t.includes(p[p.length - 1]);
  });
  console.log(
    hit
      ? `${ex}: YES type=${hit.driverType} gp=${hit.grossProfit} gross=${hit.grossIncome} fuel=${hit.fuel}`
      : `${ex}: not in week`
  );
}

// Prior weeks from stored table — quick weird scan
console.log("\n=== prior weeks weird scan (stored) ===");
for (const w of weeks) {
  const [wrows] = await pool.query(
    `SELECT driver_name, driver_type, linehaul_pct, mileage, gross_income, fuel, gross_profit
       FROM gross_profit_reports WHERE year=? AND week=?`,
    [w.year, w.week]
  );
  const woo = wrows.filter((r) =>
    isOwnerOperator({ driverType: r.driver_type, name: r.driver_name })
  );
  const weird = woo.filter((r) => {
    const gp = Number(r.gross_profit) || 0;
    const gi = Number(r.gross_income) || 0;
    const mi = Number(r.mileage) || 0;
    const pct = r.linehaul_pct == null ? null : Number(r.linehaul_pct);
    return (
      gp < -500 ||
      (gi > 1000 && (pct == null || pct === 0)) ||
      (mi > 100 && gi === 0) ||
      (gi > 0 && Math.abs(gp) > gi)
    );
  });
  console.log(
    `W${w.week}: OO=${woo.length} weird=${weird.length}`,
    weird.map(
      (r) =>
        `${r.driver_name} gp=${r.gross_profit} gi=${r.gross_income} mi=${r.mileage} pct=${r.linehaul_pct}`
    )
  );
}

await pool.end();
