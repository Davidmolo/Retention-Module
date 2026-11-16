import type { RowDataPacket } from 'mysql2';
import { getPool } from '../db';
import { prepareReportWeek } from '../jobs/prepareReportWeek';
import { weekRange } from '../week';
import { storeWeeklySummary } from './weeklySummary';

/**
 * A week can be stored before OpenRoad linehaul lands. loads.linehaul_rate
 * and loads.revenue stay empty; linehaul is on load_financials. If that
 * snapshot is kept, Total Gross In stays $0 for every driver.
 */
async function storedGrossIsEmptyWhileLinehaulExists(
  year: number,
  week: number
): Promise<boolean> {
  const { start, end } = weekRange(year, week);
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT
        (SELECT COALESCE(SUM(gross_income), 0)
           FROM gross_profit_reports
          WHERE year = ? AND week = ?) AS stored_gross,
        (SELECT COUNT(*)
           FROM loads l
           JOIN load_financials lf ON lf.load_id = l.id
          WHERE DATE(l.delivery_at) BETWEEN ? AND ?
            AND COALESCE(lf.linehaul_rate, 0) > 0) AS loads_with_linehaul`,
    [year, week, start, end]
  );
  const stored = Number(rows[0]?.stored_gross ?? 0);
  const loads = Number(rows[0]?.loads_with_linehaul ?? 0);
  return stored <= 0 && loads > 0;
}

export type EnsureGpWeekResult = {
  year: number;
  week: number;
  /** Served from existing snapshot. */
  source: 'db' | 'live';
  storedDrivers: number;
};

/** How many rows exist in gross_profit_reports for this week. */
export async function countStoredGpDrivers(
  year: number,
  week: number
): Promise<number> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT COUNT(*) AS n FROM gross_profit_reports WHERE year = ? AND week = ?`,
    [year, week]
  );
  return Number(rows[0]?.n ?? 0);
}

/**
 * Prefer DB snapshot. If the week is missing/empty, pull live OR/fuel sources
 * and store the week, then callers read from DB.
 */
export async function ensureGpWeek(
  year: number,
  week: number
): Promise<EnsureGpWeekResult> {
  const existing = await countStoredGpDrivers(year, week);
  if (existing > 0 && !(await storedGrossIsEmptyWhileLinehaulExists(year, week))) {
    return {
      year,
      week,
      source: 'db',
      storedDrivers: existing,
    };
  }

  console.log(
    `[ensureGpWeek] W${week} ${year} missing or Total Gross In is $0 — going live (prepare + store)`
  );
  await prepareReportWeek(year, week);
  const stored = await storeWeeklySummary(year, week);
  return {
    year,
    week,
    source: 'live',
    storedDrivers: stored.drivers,
  };
}

/** Refresh a week from live sources into DB (cron / explicit rebuild). */
export async function refreshGpWeekFromLive(
  year: number,
  week: number
): Promise<{ year: number; week: number; drivers: number }> {
  await prepareReportWeek(year, week);
  return storeWeeklySummary(year, week);
}
