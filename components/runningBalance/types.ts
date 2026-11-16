import type { RunningBalancePayload, YearWeek } from '@/lib/runningBalance/types';

export type { RunningBalancePayload, YearWeek };

export type AdjustmentField = 'forSale' | 'readyAbandonedShop';

export type RunningBalanceTableProps = {
  data: RunningBalancePayload;
  columns: YearWeek[];
  onHideWeek: (week: YearWeek) => void;
  onSave: (
    year: number,
    week: number,
    field: AdjustmentField,
    value: number | null
  ) => Promise<void>;
};
