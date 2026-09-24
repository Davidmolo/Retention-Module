// OpenRoad /load_financials sync → load_financials + driver_accessorials.
// Docs: https://app.openroadtms.com/api-docs/ext/v1/index.html#/
//
//   pnpm sync:tms-load-financials          # full catalog (nightly / catch-up)
//   pnpm generate:report [year week]       # also week-scopes this sync first
//
// Cron (optional full sync after loads; generate:report still refreshes the week):
//   30 4 * * * cd /path/to/web && /usr/bin/env pnpm sync:tms-load-financials >> /var/log/tms-lf-sync.log 2>&1
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());

const { syncTmsLoadFinancials } = await import(
  '../lib/openroad/loadFinancials.ts'
);

const startedAt = new Date().toISOString();
try {
  const r = await syncTmsLoadFinancials();
  console.log(
    `[${startedAt}] tms load_financials sync: pages=${r.pages} fetched=${r.fetched} stored=${r.stored} accessorials≈${r.accessorials} skipped=${r.skipped}`
  );
  process.exit(0);
} catch (err) {
  console.error(`[${startedAt}] tms load_financials sync failed:`, err.message);
  process.exit(1);
}
