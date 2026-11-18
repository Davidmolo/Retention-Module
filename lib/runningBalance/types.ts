import type { WeekSummary } from '@/lib/runningBalance/calc';
import type { YearWeek } from '@/lib/runningBalance/weeks';

export type { WeekSummary, YearWeek };

export type RunningBalanceDriver = {
  driverId: number;
  name: string;
  /** Owner-operator rows are gray. Company drivers stay on the grid, unshaded. */
  ownerOperator: boolean;
  terminated: boolean;
  /** Set when the driver's first week is negative and left out of the average. */
  negativeFirstWeekId: string | null;
  average: number | null;
  /** Week id `year-week` → gross profit. Missing key means no settlement. */
  cells: Record<string, number>;
};

export type RunningBalancePayload = {
  anchor: YearWeek;
  /** Newest week that may be shown. Later weeks wait until the Thursday after they end. */
  released: YearWeek;
  visibleWeeks: YearWeek[];
  olderWeeks: YearWeek[];
  weeks: (YearWeek & WeekSummary)[];
  drivers: RunningBalanceDriver[];
};
