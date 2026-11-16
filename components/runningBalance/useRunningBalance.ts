'use client';

import { useCallback, useEffect, useState } from 'react';
import type { WeekAdjustment } from '@/lib/runningBalance/calc';
import type { RunningBalancePayload, YearWeek } from '@/lib/runningBalance/types';
import { addWeeks, weekId } from '@/lib/runningBalance/weeks';
import type { AdjustmentField } from '@/components/runningBalance/types';

function withAdjustment(
  data: RunningBalancePayload,
  year: number,
  week: number,
  saved: WeekAdjustment
): RunningBalancePayload {
  const id = weekId({ year, week });
  return {
    ...data,
    weeks: data.weeks.map((row) => {
      if (weekId(row) !== id || row.total == null) {
        return weekId(row) === id ? { ...row, ...saved } : row;
      }
      const grandTotal =
        Math.round(
          (row.total - (saved.forSale ?? 0) - (saved.readyAbandonedShop ?? 0)) * 100
        ) / 100;
      return { ...row, ...saved, grandTotal };
    }),
  };
}

export function useRunningBalance() {
  const [anchor, setAnchor] = useState<YearWeek | null>(null);
  const [data, setData] = useState<RunningBalancePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (anchor) {
      params.set('year', String(anchor.year));
      params.set('week', String(anchor.week));
    }
    const qs = params.toString();
    setLoading(true);
    fetch(`/api/running-balance${qs ? `?${qs}` : ''}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        return (await res.json()) as RunningBalancePayload;
      })
      .then((payload) => {
        if (cancelled) return;
        setData(payload);
        setError('');
      })
      .catch(() => {
        if (!cancelled) setError('load');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [anchor]);

  const stepWeek = useCallback(
    (delta: number) => {
      const base = anchor ?? data?.anchor;
      if (!base) return;
      setAnchor(addWeeks(base, delta));
    },
    [anchor, data?.anchor]
  );

  const save = useCallback(
    async (year: number, week: number, field: AdjustmentField, value: number | null) => {
      setSaveError('');
      const res = await fetch('/api/running-balance/adjustment', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, week, [field]: value }),
      });
      if (!res.ok) {
        setSaveError('save');
        throw new Error(String(res.status));
      }
      const saved = (await res.json()) as WeekAdjustment & { year: number; week: number };
      setData((current) =>
        current
          ? withAdjustment(current, year, week, {
              forSale: saved.forSale,
              readyAbandonedShop: saved.readyAbandonedShop,
            })
          : current
      );
    },
    []
  );

  return { data, loading, error, saveError, stepWeek, save };
}
