// Scheduled/batch generation of a weekly Gross Profit sheet.
// Usage:
//   pnpm generate:week            # current ISO week
//   pnpm generate:week 2026 27    # explicit year + week
// Wire this to system cron.
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());

// Imported after env is loaded (they read process.env lazily).
const { assembleWeek } = await import('../lib/sources/assemble.ts');
const { generateGrossProfitSheet } = await import('../lib/grossProfitSheet.ts');
const { weekOf } = await import('../lib/week.ts');

const [, , argYear, argWeek] = process.argv;
const { year, week } = argYear && argWeek
  ? { year: Number(argYear), week: Number(argWeek) }
  : weekOf(new Date()); // Tuesday-start week

console.log(`Generating Gross Profit sheet for W${week} (${year})...`);
const data = await assembleWeek(year, week);
const buffer = await generateGrossProfitSheet(data);

const outDir = path.join(process.cwd(), 'data', 'generated');
mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, `Gross-Profit-Sheet-W${week}-${year}.xlsx`);
writeFileSync(outPath, buffer);
console.log('Wrote', outPath);

// The DB pool keeps the event loop alive; exit explicitly for cron.
process.exit(0);
