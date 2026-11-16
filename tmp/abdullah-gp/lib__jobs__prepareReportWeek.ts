import { weekOf, weekRange } from '../week';
import { syncTmsCompensations } from '../openroad/compensations';
import { syncTmsLoads } from '../openroad/loads';
import { syncTmsDriverRoutes } from '../openroad/driverRoutes';
import { syncLoadFinancialsForWeek } from '../openroad/loadFinancials';
import { linkFuelDrivers } from '../dat/linkFuelDrivers';
import { syncRelayFuelForWeek } from '../relay/syncFuel';
import { syncSamsaraMpg } from '../samsara/mpg';

export type PrepareReportWeekResult = {
  year: number;
  week: number;
  start: string;
  end: string;
  steps: Record<string, unknown>;
};

function previousWeek(year: number, week: number): { year: number; week: number } {
  if (week > 1) return { year, week: week - 1 };
  // Fall back via calendar: Monday of this week − 7 days.
  const { start } = weekRange(year, week);
  const d = new Date(`${start}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 7);
  return weekOf(d);
}

function log(msg: string) {
  console.log(`[prepareReportWeek] ${msg}`);
}

/**
 * Phase A — pull fresh API data into MySQL before computing a week report.
 *
 * Order matters (same idea as crontab): pay rates → loads → routes (counts) →
 * accessorials → fuel link / Relay / Samsara.
 *
 * Set GENERATE_REPORT_SKIP_LOADS_SYNC=1 to skip the long full loads sync when
 * loads were just synced (e.g. cron already ran sync:tms-loads).
 */
export async function prepareReportWeek(
  year: number,
  week: number
): Promise<PrepareReportWeekResult> {
  const { start, end } = weekRange(year, week);
  const steps: Record<string, unknown> = {};
  const skipLoads =
    String(process.env.GENERATE_REPORT_SKIP_LOADS_SYNC || '').trim() === '1';

  log(`W${week} ${year} (${start}→${end}) — refreshing sources…`);

  const comps = await syncTmsCompensations();
  steps.compensations = comps;
  log(`compensations: pages=${comps.pages} stored=${comps.stored}`);

  if (skipLoads) {
    steps.loads = { skipped: true, reason: 'GENERATE_REPORT_SKIP_LOADS_SYNC=1' };
    log('loads: skipped (GENERATE_REPORT_SKIP_LOADS_SYNC=1)');
  } else {
    const loads = await syncTmsLoads();
    steps.loads = loads;
    log(
      `loads: pages=${loads.pages} fetched=${loads.fetched} stored=${loads.stored} skipped=${loads.skipped}`
    );
  }

  // Target week + previous week so helper legs dated just before delivery week
  // are present (multi-driver week bucketing uses route created_at).
  const prev = previousWeek(year, week);
  const routesThis = await syncTmsDriverRoutes(year, week);
  steps.driverRoutesWeek = routesThis;
  log(
    `driver_routes W${week}: pages=${routesThis.pages} fetched=${routesThis.fetched} stored=${routesThis.stored}`
  );
  const routesPrev = await syncTmsDriverRoutes(prev.year, prev.week);
  steps.driverRoutesPrevWeek = routesPrev;
  log(
    `driver_routes W${prev.week}: pages=${routesPrev.pages} fetched=${routesPrev.fetched} stored=${routesPrev.stored}`
  );

  const lf = await syncLoadFinancialsForWeek(year, week);
  steps.loadFinancials = lf;
  log(
    `load_financials: fetched=${lf.fetched} stored≈${lf.stored} accessorials≈${lf.accessorials}`
  );

  const fuelLink = await linkFuelDrivers();
  steps.fuelLink = fuelLink;
  log(`fuel link: name=${fuelLink.nameLinked} unit=${fuelLink.unitLinked}`);

  if (process.env.RELAY_API_KEY) {
    const relay = await syncRelayFuelForWeek(year, week);
    steps.relayFuel = relay;
    log(
      `relay fuel: fetched=${relay.fetched} matched=${relay.matched} drivers=${relay.drivers}`
    );
  } else {
    steps.relayFuel = { skipped: true, reason: 'RELAY_API_KEY not set' };
    log('relay fuel: skipped (RELAY_API_KEY not set)');
  }

  const mpg = await syncSamsaraMpg(year, week);
  steps.samsaraMpg = mpg;
  log(
    `samsara MPG: vehicles=${mpg.vehicles} drivers=${mpg.drivers} vehLinked=${mpg.vehiclesLinked}`
  );

  log(`W${week} ${year} sources ready`);
  return { year, week, start, end, steps };
}
