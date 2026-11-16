'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { RunningBalanceTable } from '@/components/runningBalance/RunningBalanceTable';
import { useRunningBalance } from '@/components/runningBalance/useRunningBalance';
import { text } from '@/src/constants/text';
import { compareWeeks, parseWeekId, weekId, type YearWeek } from '@/lib/runningBalance/weeks';

export function RunningBalanceView() {
  const { data, loading, error, saveError, stepWeek, save } = useRunningBalance();
  const [extraIds, setExtraIds] = useState<string[]>([]);

  const columns = useMemo(() => {
    if (!data) return [];
    const olderIds = new Set(data.olderWeeks.map(weekId));
    const extra = extraIds
      .map(parseWeekId)
      .filter((week): week is YearWeek => week != null && olderIds.has(weekId(week)))
      .sort(compareWeeks);
    return [...extra, ...data.visibleWeeks];
  }, [data, extraIds]);

  const anchor = data?.anchor;

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between mb-6">
        <h1 className="text-2xl sm:text-4xl font-bold text-foreground">
          {text.runningBalance.title}
          {anchor ? ` — W${anchor.week} (${anchor.year})` : ''}
        </h1>
        <div className="flex flex-col min-[480px]:flex-row min-[480px]:flex-wrap items-stretch min-[480px]:items-center gap-2">
          {data && data.olderWeeks.length > 0 && (
            <select
              aria-label={text.runningBalance.showOlderWeek}
              className="w-full min-[480px]:w-auto px-3 py-2 border border-input rounded-md bg-background text-foreground"
              value=""
              onChange={(e) => {
                const id = e.target.value;
                if (!id) return;
                setExtraIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
              }}
            >
              <option value="">{text.runningBalance.olderWeekPlaceholder}</option>
              {data.olderWeeks
                .filter((week) => !extraIds.includes(weekId(week)))
                .map((week) => (
                  <option key={weekId(week)} value={weekId(week)}>
                    {`W${week.week} ${week.year}`}
                  </option>
                ))}
            </select>
          )}
          <Button variant="outline" onClick={() => stepWeek(-1)} disabled={!data}>
            {text.runningBalance.prevWeek}
          </Button>
          <Button variant="outline" onClick={() => stepWeek(1)} disabled={!data}>
            {text.runningBalance.nextWeek}
          </Button>
        </div>
      </div>

      {saveError ? (
        <p className="text-destructive mb-4">{text.runningBalance.saveError}</p>
      ) : null}

      {loading ? (
        <p className="text-muted-foreground py-12 text-center">{text.runningBalance.loading}</p>
      ) : error ? (
        <p className="text-destructive py-12 text-center">{text.runningBalance.loadError}</p>
      ) : !data || (data.drivers.length === 0 && data.weeks.every((week) => !week.stored)) ? (
        <p className="text-muted-foreground py-12 text-center">{text.runningBalance.empty}</p>
      ) : (
        <RunningBalanceTable
          data={{
            ...data,
            drivers: data.drivers.filter((driver) =>
              columns.some((week) => driver.cells[weekId(week)] != null)
            ),
          }}
          columns={columns}
          onHideWeek={(week) =>
            setExtraIds((ids) => ids.filter((id) => id !== weekId(week)))
          }
          onSave={save}
        />
      )}
    </div>
  );
}
