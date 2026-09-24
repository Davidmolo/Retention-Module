// Import fuel-card .dat extracts into the DB.
// Usage:
//   pnpm import:fuel                      # imports all of ../sftp-files
//   pnpm import:fuel path/to/file.dat     # one file
//   pnpm import:fuel path/to/dir          # a directory
//   pnpm import:fuel --force [path]       # re-import already-loaded files
import fs from 'node:fs';
import path from 'node:path';
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());

const { importFuelFile, importFuelDir } = await import('../lib/dat/importFuel.ts');

const args = process.argv.slice(2);
const force = args.includes('--force');
const target = args.find((a) => a !== '--force')
  ?? path.join(process.cwd(), '..', 'sftp-files');

const isDir = fs.existsSync(target) && fs.statSync(target).isDirectory();
const results = isDir
  ? await importFuelDir(target, { force })
  : [await importFuelFile(target, { force })];

const inserted = results.reduce((s, r) => s + r.inserted, 0);
const skipped = results.filter((r) => r.skipped).length;
console.log(
  `Imported ${results.length - skipped} file(s), ${inserted} transactions` +
    (skipped ? `, skipped ${skipped} already-imported (use --force to replace)` : '')
);
process.exit(0);
