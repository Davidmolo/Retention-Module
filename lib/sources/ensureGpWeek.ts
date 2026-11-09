import type { RowDataPacket } from 'mysql2';
import { getPool } from '../db';
import { prepareReportWeek } from '../jobs/prepareReportWeek';
import { storeWeeklySummary } from './weeklySummary';

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
  if (existing > 0) {
    return {
      year,
      week,
      source: 'db',
      storedDrivers: existing,
    };
  }

  console.log(
    `[ensureGpWeek] W${week} ${year} missing in DB — going live (prepare + store)`
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
