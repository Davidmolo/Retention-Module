import { weekOf, weekRange } from '../week';
import { syncTolls } from '../prepass/sync';
import { syncTmsCompensations } from '../openroad/compensations';
import { syncTmsDrivers } from '../openroad/sync';
import { syncTmsTrucks } from '../openroad/trucks';
import { syncTmsLoads } from '../openroad/loads';
import { syncTmsDriverRoutes } from '../openroad/driverRoutes';
import { syncTmsAssignments } from '../openroad/assignments';
import { syncTmsLoadFinancials, syncLoadFinancialsForWeek } from '../openroad/loadFinancials';
import { syncFuelFromSftp } from '../sftp/fuelSync';
import { syncSamsaraMpg } from '../samsara/mpg';
import { linkFuelDrivers } from '../dat/linkFuelDrivers';
import { syncRelayFuelForWeek } from '../relay/syncFuel';
import { storeWeeklySummary } from '../sources/weeklySummary';

/** Matches production `crontab` (America/New_York). */
export type CronJobId =
  | 'sync-tolls'
  | 'sync-tms-compensations'
  | 'sync-tms-drivers'
  | 'sync-tms-trucks'
  | 'sync-tms-loads'
  | 'sync-tms-driver-routes'
  | 'sync-tms-assignments'
  | 'sync-tms-load-financials'
  | 'sync-fuel'
  | 'sync-samsara-mpg'
  | 'backfill-drivers'
  | 'sync-relay-fuel'
  | 'generate-report'
  | 'sync-all';

export type CronJobMeta = {
  id: CronJobId;
  label: string;
  script: string;
  schedule: string;
  scheduleLabel: string;
  /** Needs year/week (defaults to previous completed week). */
  needsWeek?: boolean;
  /** May take several minutes. */
  longRunning?: boolean;
};

/** Cron order for “Run all” (same pipeline as production crontab). */
export const SYNC_ALL_ORDER: Exclude<CronJobId, 'sync-all'>[] = [
  'sync-tolls',
  'sync-tms-compensations',
  'sync-tms-drivers',
  'sync-tms-trucks',
  'sync-tms-loads',
  'sync-tms-driver-routes',
  'sync-tms-assignments',
  'sync-tms-load-financials',
  'sync-fuel',
  'sync-samsara-mpg',
  'backfill-drivers',
  'sync-relay-fuel',
  'generate-report',
];

export const CRON_JOBS: CronJobMeta[] = [
  {
    id: 'sync-all',
    label: 'Run all syncs (+ generate report)',
    script: 'all (13 jobs in order)',
    schedule: '—',
    scheduleLabel: 'Manual — full pipeline',
    needsWeek: true,
    longRunning: true,
  },
  {
    id: 'sync-tolls',
    label: 'Sync PrePass tolls',
    script: 'sync:tolls',
    schedule: '0 3 * * *',
    scheduleLabel: 'Daily 3:00 AM ET',
  },
  {
    id: 'sync-tms-compensations',
    label: 'Sync TMS compensations',
    script: 'sync:tms-compensations',
    schedule: '45 3 * * *',
    scheduleLabel: 'Daily 3:45 AM ET',
  },
  {
    id: 'sync-tms-drivers',
    label: 'Sync TMS drivers',
    script: 'sync:tms-drivers',
    schedule: '0 4 * * *',
    scheduleLabel: 'Daily 4:00 AM ET',
  },
  {
    id: 'sync-tms-trucks',
    label: 'Sync TMS trucks',
    script: 'sync:tms-trucks',
    schedule: '15 4 * * *',
    scheduleLabel: 'Daily 4:15 AM ET',
  },
  {
    id: 'sync-tms-loads',
    label: 'Sync TMS loads',
    script: 'sync:tms-loads',
    schedule: '20 4 * * *',
    scheduleLabel: 'Daily 4:20 AM ET',
    longRunning: true,
  },
  {
    id: 'sync-tms-driver-routes',
    label: 'Sync TMS driver routes (full)',
    script: 'sync:tms-driver-routes --all',
    schedule: '25 4 * * *',
    scheduleLabel: 'Daily 4:25 AM ET',
    longRunning: true,
  },
  {
    id: 'sync-tms-assignments',
    label: 'Sync TMS assignments',
    script: 'sync:tms-assignments',
    schedule: '30 4 * * *',
    scheduleLabel: 'Daily 4:30 AM ET',
  },
  {
    id: 'sync-tms-load-financials',
    label: 'Sync TMS load financials',
    script: 'sync:tms-load-financials',
    schedule: '35 4 * * *',
    scheduleLabel: 'Daily 4:35 AM ET',
    longRunning: true,
  },
  {
    id: 'sync-fuel',
    label: 'Sync fuel (.dat via SFTP)',
    script: 'sync:fuel',
    schedule: '*/30 * * * *',
    scheduleLabel: 'Every 30 minutes',
  },
  {
    id: 'sync-samsara-mpg',
    label: 'Sync Samsara MPG',
    script: 'sync:samsara-mpg',
    schedule: '0 5 * * 2',
    scheduleLabel: 'Tue 5:00 AM ET',
    needsWeek: true,
  },
  {
    id: 'backfill-drivers',
    label: 'Link unlinked fuel → drivers',
    script: 'backfill:drivers',
    schedule: '30 5 * * 2',
    scheduleLabel: 'Tue 5:30 AM ET',
  },
  {
    id: 'sync-relay-fuel',
    label: 'Sync Relay fuel (OO)',
    script: 'sync:relay-fuel',
    schedule: '45 5 * * 2',
    scheduleLabel: 'Tue 5:45 AM ET',
    needsWeek: true,
  },
  {
    id: 'generate-report',
    label: 'Generate GP report (store week)',
    script: 'generate:report',
    schedule: '0 6 * * 2',
    scheduleLabel: 'Tue 6:00 AM ET',
    needsWeek: true,
    longRunning: true,
  },
];

export function previousCompletedWeek(): { year: number; week: number } {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 7);
  return weekOf(d);
}

function resolveWeek(
  year?: number | null,
  week?: number | null
): { year: number; week: number } {
  if (
    year != null &&
    week != null &&
    Number.isInteger(year) &&
    Number.isInteger(week) &&
    year >= 2000 &&
    week >= 1 &&
    week <= 53
  ) {
    return { year, week };
  }
  return previousCompletedWeek();
}

export type CronRunResult = {
  id: CronJobId;
  ok: boolean;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  summary: string;
  detail?: unknown;
  error?: string;
};

export async function runCronJob(
  id: CronJobId,
  opts: { year?: number | null; week?: number | null } = {}
): Promise<CronRunResult> {
  const startedAt = new Date();
  const startIso = startedAt.toISOString();

  if (id === 'sync-all') {
    const steps: CronRunResult[] = [];
    let failed: CronRunResult | null = null;
    for (const stepId of SYNC_ALL_ORDER) {
      const step = await runCronJob(stepId, opts);
      steps.push(step);
      if (!step.ok) {
        failed = step;
        break;
      }
    }
    const finishedAt = new Date();
    const okCount = steps.filter((s) => s.ok).length;
    const lines = steps.map(
      (s) => `${s.ok ? 'OK' : 'FAIL'} ${s.id}: ${s.error ?? s.summary}`
    );
    return {
      id: 'sync-all',
      ok: failed == null,
      startedAt: startIso,
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      summary: failed
        ? `Stopped after ${okCount}/${SYNC_ALL_ORDER.length} — failed at ${failed.id}`
        : `All ${okCount} jobs completed`,
      detail: { steps: lines },
      error: failed?.error,
    };
  }

  try {
    let summary = '';
    let detail: unknown;

    switch (id) {
      case 'sync-tolls': {
        const lookback = Number(process.env.PREPASS_LOOKBACK_DAYS || 14);
        const end = new Date();
        const from = new Date(end);
        from.setUTCDate(from.getUTCDate() - lookback);
        const fmt = (d: Date) => d.toISOString().slice(0, 10);
        const r = await syncTolls({ start: fmt(from), end: fmt(end) });
        detail = r;
        summary = `${r.start}→${r.end}: fetched=${r.fetched} stored=${r.stored} linked=${r.linked}`;
        break;
      }
      case 'sync-tms-compensations': {
        const r = await syncTmsCompensations();
        detail = r;
        summary = `pages=${r.pages} fetched=${r.fetched} stored=${r.stored}`;
        break;
      }
      case 'sync-tms-drivers': {
        const r = await syncTmsDrivers();
        detail = r;
        summary = `pages=${r.pages} fetched=${r.fetched} stored=${r.stored} skipped=${r.skipped}`;
        break;
      }
      case 'sync-tms-trucks': {
        const r = await syncTmsTrucks();
        detail = r;
        summary = `pages=${r.pages} fetched=${r.fetched} stored=${r.stored}`;
        break;
      }
      case 'sync-tms-loads': {
        const r = await syncTmsLoads();
        detail = r;
        summary = `pages=${r.pages} fetched=${r.fetched} stored=${r.stored}`;
        break;
      }
      case 'sync-tms-driver-routes': {
        // Full sync (no year/week) — same as cron `--all`
        const r = await syncTmsDriverRoutes();
        detail = r;
        summary = `pages=${r.pages} fetched=${r.fetched} stored=${r.stored}`;
        break;
      }
      case 'sync-tms-assignments': {
        const r = await syncTmsAssignments();
        detail = r;
        summary = `pages=${r.pages} fetched=${r.fetched} stored=${r.stored}`;
        break;
      }
      case 'sync-tms-load-financials': {
        const r = await syncTmsLoadFinancials();
        detail = r;
        summary = `pages=${r.pages} fetched=${r.fetched} stored≈${r.stored}`;
        break;
      }
      case 'sync-fuel': {
        const r = await syncFuelFromSftp();
        detail = r;
        summary = `remote=${r.remoteFiles} new=${r.newFiles} imported=${r.imported} txns=${r.transactions} errors=${r.errors.length}`;
        break;
      }
      case 'sync-samsara-mpg': {
        const { year, week } = resolveWeek(opts.year, opts.week);
        const r = await syncSamsaraMpg(year, week);
        detail = r;
        summary = `W${week} ${year}: vehicles=${r.vehicles} drivers=${r.drivers}`;
        break;
      }
      case 'backfill-drivers': {
        const r = await linkFuelDrivers();
        detail = r;
        summary = `nameLinked=${r.nameLinked} unitLinked=${r.unitLinked}`;
        break;
      }
      case 'sync-relay-fuel': {
        const { year, week } = resolveWeek(opts.year, opts.week);
        if (!process.env.RELAY_API_KEY) {
          summary = `W${week} ${year}: skipped (RELAY_API_KEY not set)`;
          break;
        }
        const r = await syncRelayFuelForWeek(year, week);
        detail = r;
        summary = `W${week} ${year}: fetched=${r.fetched} matched=${r.matched} drivers=${r.drivers}`;
        break;
      }
      case 'generate-report': {
        const { year, week } = resolveWeek(opts.year, opts.week);
        const { start, end } = weekRange(year, week);
        const lf = await syncLoadFinancialsForWeek(year, week);
        const fuelLink = await linkFuelDrivers();
        let relay: unknown = null;
        if (process.env.RELAY_API_KEY) {
          relay = await syncRelayFuelForWeek(year, week);
        }
        const mpg = await syncSamsaraMpg(year, week);
        const stored = await storeWeeklySummary(year, week);
        detail = { start, end, lf, fuelLink, relay, mpg, stored };
        summary = `W${week} ${year} (${start}→${end}): stored ${stored.drivers} drivers`;
        break;
      }
      default: {
        const _exhaustive: never = id;
        throw new Error(`Unknown job: ${_exhaustive}`);
      }
    }

    const finishedAt = new Date();
    return {
      id,
      ok: true,
      startedAt: startIso,
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      summary,
      detail,
    };
  } catch (err) {
    const finishedAt = new Date();
    const message = err instanceof Error ? err.message : String(err);
    return {
      id,
      ok: false,
      startedAt: startIso,
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      summary: 'Failed',
      error: message,
    };
  }
}
