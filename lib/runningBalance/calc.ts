import { compareWeeks, weekId, type YearWeek } from '@/lib/runningBalance/weeks';

/**
 * Open with Mantas.
 * Average uses the last 7 weeks on screen.
 * A driver's first week is left out of the average entirely.
 */
export const AVERAGE_SCOPE: 'visible' | 'all' = 'visible';
export const EXCLUDE_FIRST_WEEK = true;

export const GREEN_MIN = 600;

export type ProfitBand = 'red' | 'white' | 'green';

export type WeekAdjustment = {
  forSale: number | null;
  readyAbandonedShop: number | null;
};

export type WeekSummary = WeekAdjustment & {
  owners: number;
  total: number | null;
  negativeCount: number;
  negativeAmount: number | null;
  whiteCount: number;
  greenCount: number;
  grandTotal: number | null;
  stored: boolean;
};

export function profitBand(grossProfit: number): ProfitBand {
  if (grossProfit < 0) return 'red';
  if (grossProfit >= GREEN_MIN) return 'green';
  return 'white';
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function summarizeWeek(
  values: number[],
  adjustment: WeekAdjustment,
  stored: boolean
): WeekSummary {
  if (!stored) {
    return {
      owners: 0,
      total: null,
      negativeCount: 0,
      negativeAmount: null,
      whiteCount: 0,
      greenCount: 0,
      forSale: adjustment.forSale,
      readyAbandonedShop: adjustment.readyAbandonedShop,
      grandTotal: null,
      stored: false,
    };
  }

  let total = 0;
  let negativeAmount = 0;
  let negativeCount = 0;
  let whiteCount = 0;
  let greenCount = 0;
  for (const gp of values) {
    total += gp;
    const band = profitBand(gp);
    if (band === 'red') {
      negativeCount += 1;
      negativeAmount += gp;
    } else if (band === 'white') {
      whiteCount += 1;
    } else {
      greenCount += 1;
    }
  }
  total = roundMoney(total);
  negativeAmount = roundMoney(negativeAmount);
  const grandTotal = roundMoney(
    total - (adjustment.forSale ?? 0) - (adjustment.readyAbandonedShop ?? 0)
  );
  return {
    owners: values.length,
    total,
    negativeCount,
    negativeAmount,
    whiteCount,
    greenCount,
    forSale: adjustment.forSale,
    readyAbandonedShop: adjustment.readyAbandonedShop,
    grandTotal,
    stored: true,
  };
}

export type HistoryCell = YearWeek & { grossProfit: number };

/** Blank weeks are skipped. They are not treated as zero. */
export function driverAverage(
  history: HistoryCell[],
  visibleWeeks: YearWeek[]
): number | null {
  if (!history.length) return null;
  const sorted = [...history].sort(compareWeeks);
  const firstId = weekId(sorted[0]);
  const visibleIds = new Set(visibleWeeks.map(weekId));
  let pool =
    AVERAGE_SCOPE === 'visible'
      ? sorted.filter((cell) => visibleIds.has(weekId(cell)))
      : sorted;
  if (EXCLUDE_FIRST_WEEK) {
    pool = pool.filter((cell) => weekId(cell) !== firstId);
  }
  if (!pool.length) return null;
  const sum = pool.reduce((acc, cell) => acc + cell.grossProfit, 0);
  return roundMoney(sum / pool.length);
}
