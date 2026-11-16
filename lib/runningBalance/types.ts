import type { WeekSummary } from '@/lib/runningBalance/calc';
import type { YearWeek } from '@/lib/runningBalance/weeks';

export type { WeekSummary, YearWeek };

export type RunningBalanceDriver = {
  driverId: number;
  name: string;
  terminated: boolean;
  average: number | null;
  /** Week id `year-week` → gross profit. Missing key means no settlement. */
  cells: Record<string, number>;
};

export type RunningBalancePayload = {
  anchor: YearWeek;
  visibleWeeks: YearWeek[];
  olderWeeks: YearWeek[];
  weeks: (YearWeek & WeekSummary)[];
  drivers: RunningBalanceDriver[];
};
