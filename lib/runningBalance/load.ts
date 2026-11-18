import type { RowDataPacket } from 'mysql2/promise';
import { mapDriverStatus } from '@/lib/adapters/gp/gpMapping';
import { getPool } from '@/lib/db';
import {
  isGpExcludedDriverName,
  isOwnerOperator,
} from '@/lib/sources/driverTypeGroups';
import {
  driverAverage,
  summarizeWeek,
  type HistoryCell,
  type WeekAdjustment,
} from '@/lib/runningBalance/calc';
import type { RunningBalancePayload } from '@/lib/runningBalance/types';
import {
  compareWeeks,
  latestReleasedWeek,
  VISIBLE_WEEK_COUNT,
  weekId,
  weekKey,
  weeksEndingAt,
  type YearWeek,
} from '@/lib/runningBalance/weeks';

type ReportRow = RowDataPacket & {
  year: number;
  week: number;
  driver_id: number;
  driver_name: string | null;
  driver_status: string | null;
  driver_type: string | null;
  gross_profit: string | number | null;
};

type AdjustmentRow = RowDataPacket & {
  year: number;
  week: number;
  for_sale: string | number | null;
  ready_abandoned_shop: string | number | null;
};

type StatusRow = RowDataPacket & {
  id: number;
  status: string | null;
  date_removed: Date | string | null;
};

function emptyAdjustment(): WeekAdjustment {
  return { forSale: null, readyAbandonedShop: null };
}

function moneyOrNull(v: string | number | null): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function isTerminated(
  status: string | null | undefined,
  dateRemoved?: Date | string | null
): boolean {
  if (dateRemoved != null && String(dateRemoved).trim() !== '') {
    return mapDriverStatus(status, dateRemoved) === 'terminated';
  }
  const s = (status ?? '').trim().toLowerCase();
  return s.includes('terminat') || s.includes('removed');
}

export async function getRunningBalance(
  requested?: YearWeek
): Promise<RunningBalancePayload> {
  const pool = getPool();
  const released = latestReleasedWeek();
  const anchor =
    requested && compareWeeks(requested, released) <= 0 ? requested : released;

  const visibleWeeks = weeksEndingAt(anchor, VISIBLE_WEEK_COUNT);
  const oldestVisible = weekKey(visibleWeeks[0]);

  const [reportRows] = await pool.query<ReportRow[]>(
    `SELECT year, week, driver_id, driver_name, driver_status, driver_type, gross_profit
       FROM gross_profit_reports`
  );
  const [adjustmentRows] = await pool.query<AdjustmentRow[]>(
    `SELECT year, week, for_sale, ready_abandoned_shop
       FROM running_balance_week_adjustments`
  );

  const storedIds = new Set<string>();
  const byDriver = new Map<
    number,
    {
      name: string;
      latestKey: number;
      status: string | null;
      ownerOperator: boolean;
      history: HistoryCell[];
    }
  >();
  const ownersByWeek = new Map<string, number>();

  for (const row of reportRows) {
    const year = Number(row.year);
    const week = Number(row.week);
    const id = weekId({ year, week });
    storedIds.add(id);
    const name = (row.driver_name ?? '').trim();
    if (!name || isGpExcludedDriverName(name)) continue;
    const grossProfit = moneyOrNull(row.gross_profit);
    if (grossProfit == null) continue;
    const ownerOperator = isOwnerOperator({ driverType: row.driver_type, name });
    if (ownerOperator) ownersByWeek.set(id, (ownersByWeek.get(id) ?? 0) + 1);
    const driverId = Number(row.driver_id);
    const key = weekKey({ year, week });
    const existing = byDriver.get(driverId);
    if (!existing) {
      byDriver.set(driverId, {
        name,
        latestKey: key,
        status: row.driver_status,
        ownerOperator,
        history: [{ year, week, grossProfit }],
      });
    } else {
      existing.history.push({ year, week, grossProfit });
      if (key >= existing.latestKey) {
        existing.latestKey = key;
        existing.name = name || existing.name;
        existing.status = row.driver_status;
        existing.ownerOperator = ownerOperator;
      }
    }
  }

  const driverIds = [...byDriver.keys()];
  const currentStatus = new Map<number, { status: string | null; dateRemoved: Date | string | null }>();
  if (driverIds.length) {
    const [statusRows] = await pool.query<StatusRow[]>(
      `SELECT id, status, date_removed
         FROM drivers
        WHERE id IN (?)`,
      [driverIds]
    );
    for (const row of statusRows) {
      currentStatus.set(Number(row.id), {
        status: row.status,
        dateRemoved: row.date_removed,
      });
    }
  }

  const adjustments = new Map<string, WeekAdjustment>();
  for (const row of adjustmentRows) {
    adjustments.set(weekId({ year: Number(row.year), week: Number(row.week) }), {
      forSale: moneyOrNull(row.for_sale),
      readyAbandonedShop: moneyOrNull(row.ready_abandoned_shop),
    });
  }

  const valuesByWeek = new Map<string, number[]>();
  for (const driver of byDriver.values()) {
    for (const cell of driver.history) {
      const id = weekId(cell);
      const list = valuesByWeek.get(id);
      if (list) list.push(cell.grossProfit);
      else valuesByWeek.set(id, [cell.grossProfit]);
    }
  }

  const drivers: RunningBalancePayload['drivers'] = [];
  for (const [driverId, driver] of byDriver) {
    const cells: Record<string, number> = {};
    for (const cell of driver.history) cells[weekId(cell)] = cell.grossProfit;
    const live = currentStatus.get(driverId);
    const terminated = live
      ? isTerminated(live.status, live.dateRemoved)
      : isTerminated(driver.status);
    const first = [...driver.history].sort(compareWeeks)[0];
    drivers.push({
      driverId,
      name: driver.name,
      ownerOperator: driver.ownerOperator,
      terminated,
      negativeFirstWeekId: first && first.grossProfit < 0 ? weekId(first) : null,
      average: driverAverage(driver.history, visibleWeeks),
      cells,
    });
  }

  drivers.sort((a, b) => {
    if (a.average == null && b.average == null) return a.name.localeCompare(b.name);
    if (a.average == null) return 1;
    if (b.average == null) return -1;
    return a.average - b.average || a.name.localeCompare(b.name);
  });

  const olderWeekMap = new Map<string, YearWeek>();
  for (const id of storedIds) {
    const [y, w] = id.split('-');
    const yearWeek = { year: Number(y), week: Number(w) };
    if (weekKey(yearWeek) >= oldestVisible) continue;
    if (!valuesByWeek.has(id) && !adjustments.has(id)) continue;
    olderWeekMap.set(id, yearWeek);
  }
  const olderWeeks = [...olderWeekMap.values()].sort(compareWeeks);

  const weeks = visibleWeeks.map((yearWeek) => {
    const id = weekId(yearWeek);
    const summary = summarizeWeek(
      valuesByWeek.get(id) ?? [],
      ownersByWeek.get(id) ?? 0,
      adjustments.get(id) ?? emptyAdjustment(),
      storedIds.has(id)
    );
    return { ...yearWeek, ...summary };
  });

  for (const yearWeek of olderWeeks) {
    const id = weekId(yearWeek);
    const summary = summarizeWeek(
      valuesByWeek.get(id) ?? [],
      ownersByWeek.get(id) ?? 0,
      adjustments.get(id) ?? emptyAdjustment(),
      true
    );
    weeks.push({ ...yearWeek, ...summary });
  }

  return { anchor, released, visibleWeeks, olderWeeks, weeks, drivers };
}

export async function saveWeekAdjustment(
  year: number,
  week: number,
  patch: Partial<WeekAdjustment>
): Promise<WeekAdjustment> {
  const pool = getPool();
  const [rows] = await pool.query<AdjustmentRow[]>(
    `SELECT for_sale, ready_abandoned_shop
       FROM running_balance_week_adjustments
      WHERE year = ? AND week = ?`,
    [year, week]
  );
  const current: WeekAdjustment = rows.length
    ? {
        forSale: moneyOrNull(rows[0].for_sale),
        readyAbandonedShop: moneyOrNull(rows[0].ready_abandoned_shop),
      }
    : emptyAdjustment();
  const next: WeekAdjustment = {
    forSale: patch.forSale !== undefined ? patch.forSale : current.forSale,
    readyAbandonedShop:
      patch.readyAbandonedShop !== undefined
        ? patch.readyAbandonedShop
        : current.readyAbandonedShop,
  };
  await pool.query(
    `INSERT INTO running_balance_week_adjustments
       (year, week, for_sale, ready_abandoned_shop)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       for_sale = VALUES(for_sale),
       ready_abandoned_shop = VALUES(ready_abandoned_shop)`,
    [year, week, next.forSale, next.readyAbandonedShop]
  );
  return next;
}
