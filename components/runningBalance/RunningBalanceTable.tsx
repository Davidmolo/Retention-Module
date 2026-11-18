'use client';

import { useState } from 'react';
import { text } from '@/src/constants/text';
import { weekId, type YearWeek } from '@/lib/runningBalance/weeks';
import type { AdjustmentField, RunningBalanceTableProps } from '@/components/runningBalance/types';

function money(n: number): string {
  const abs = Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return n < 0 ? `-$${abs}` : `$${abs}`;
}

function weekLabel(week: YearWeek, showYear: boolean): string {
  return showYear ? `W${week.week} ${week.year}` : `W${week.week}`;
}

const stickyLabel =
  'sticky left-0 z-10 border border-border px-2 py-1 text-left shadow-[2px_0_4px_-2px_rgba(0,0,0,0.2)]';
const labelCell = `${stickyLabel} bg-card font-medium whitespace-normal sm:whitespace-nowrap min-w-[7.5rem] max-w-[9rem] sm:max-w-none`;
const numCell =
  'border border-border px-1.5 sm:px-2 py-1 text-right tabular-nums whitespace-nowrap text-xs sm:text-sm min-w-[5.5rem]';
const inputClass =
  'w-[4.5rem] sm:w-28 max-w-full bg-background text-right border border-input rounded px-1 py-0.5 text-xs sm:text-sm';

export function RunningBalanceTable({
  data,
  columns,
  onHideWeek,
  onSave,
}: RunningBalanceTableProps) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const byId = new Map(data.weeks.map((week) => [weekId(week), week]));
  const visibleIds = new Set(data.visibleWeeks.map(weekId));
  const showYear = new Set(columns.map((week) => week.year)).size > 1;
  const dash = text.runningBalance.emptyCell;

  const shown = (week: YearWeek) => byId.get(weekId(week));
  const visibleTotals = data.visibleWeeks
    .map((week) => shown(week)?.total)
    .filter((n): n is number => n != null);
  const totalAverage = visibleTotals.length
    ? Math.round(
        (visibleTotals.reduce((sum, n) => sum + n, 0) / visibleTotals.length) * 100
      ) / 100
    : null;
  const blankAverage = () => <td className={numCell} />;

  const saveDraft = async (
    week: YearWeek,
    field: AdjustmentField,
    raw: string
  ) => {
    const key = `${weekId(week)}:${field}`;
    const trimmed = raw.trim();
    const current = shown(week);
    const stored =
      field === 'forSale' ? current?.forSale : current?.readyAbandonedShop;
    if (trimmed === '') {
      if (stored == null) {
        setDrafts((d) => {
          const next = { ...d };
          delete next[key];
          return next;
        });
        return;
      }
      try {
        await onSave(week.year, week.week, field, null);
      } catch {
        return;
      }
      setDrafts((d) => {
        const next = { ...d };
        delete next[key];
        return next;
      });
      return;
    }
    const n = Number(trimmed.replace(/[$,]/g, ''));
    if (!Number.isFinite(n)) {
      setDrafts((d) => {
        const next = { ...d };
        delete next[key];
        return next;
      });
      return;
    }
    if (stored != null && Math.round(stored * 100) === Math.round(n * 100)) {
      setDrafts((d) => {
        const next = { ...d };
        delete next[key];
        return next;
      });
      return;
    }
    try {
      await onSave(week.year, week.week, field, n);
    } catch {
      return;
    }
    setDrafts((d) => {
      const next = { ...d };
      delete next[key];
      return next;
    });
  };

  const fieldValue = (week: YearWeek, field: AdjustmentField): string => {
    const key = `${weekId(week)}:${field}`;
    if (key in drafts) return drafts[key];
    const row = shown(week);
    const stored = field === 'forSale' ? row?.forSale : row?.readyAbandonedShop;
    return stored == null ? '' : String(stored);
  };

  const weekHeads = (corner: string, withAverage: boolean) => (
    <tr>
      <th className={`${labelCell} bg-muted top-0 z-30`}>{corner}</th>
      {columns.map((week) => {
        const id = weekId(week);
        const extra = !visibleIds.has(id);
        return (
          <th key={id} className={`${numCell} bg-muted font-medium sticky top-0 z-20`}>
            <div className="flex items-center justify-end gap-2">
              <span>{weekLabel(week, showYear)}</span>
              {extra && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => onHideWeek(week)}
                >
                  {text.runningBalance.hideWeek}
                </button>
              )}
            </div>
          </th>
        );
      })}
      {withAverage && (
        <th className={`${numCell} bg-muted font-medium sticky top-0 z-20`}>
          {text.runningBalance.average}
        </th>
      )}
    </tr>
  );

  return (
    <div className="space-y-8">
      <section className="overflow-x-auto">
        <table className="border-collapse min-w-max w-full">
          <thead>{weekHeads(text.runningBalance.summary, true)}</thead>
          <tbody>
          <tr>
            <th className={labelCell}>{text.runningBalance.owners}</th>
            {columns.map((week) => {
              const row = shown(week);
              return (
                <td key={weekId(week)} className={numCell}>
                  {row?.stored ? row.owners : dash}
                </td>
              );
            })}
            {blankAverage()}
          </tr>
          <tr>
            <th className={labelCell}>{text.runningBalance.total}</th>
            {columns.map((week) => {
              const row = shown(week);
              return (
                <td key={weekId(week)} className={numCell}>
                  {row?.total == null ? dash : money(row.total)}
                </td>
              );
            })}
            <td className={`${numCell} font-semibold`}>
              {totalAverage == null ? dash : money(totalAverage)}
            </td>
          </tr>
          <tr>
            <th className={labelCell}>{text.runningBalance.negative}</th>
            {columns.map((week) => {
              const row = shown(week);
              const negative = row?.negativeAmount != null && row.negativeAmount < 0;
              return (
                <td
                  key={weekId(week)}
                  className={`${numCell} ${negative ? 'text-red-600' : ''}`}
                >
                  {row?.stored && row.negativeAmount != null
                    ? `${row.negativeCount} · ${money(row.negativeAmount)}`
                    : dash}
                </td>
              );
            })}
            {blankAverage()}
          </tr>
          <tr>
            <th className={labelCell}>{text.runningBalance.white}</th>
            {columns.map((week) => {
              const row = shown(week);
              return (
                <td key={weekId(week)} className={numCell}>
                  {row?.stored ? row.whiteCount : dash}
                </td>
              );
            })}
            {blankAverage()}
          </tr>
          <tr>
            <th className={labelCell}>{text.runningBalance.green}</th>
            {columns.map((week) => {
              const row = shown(week);
              return (
                <td
                  key={weekId(week)}
                  className={`${numCell} ${row?.stored ? 'text-green-700' : ''}`}
                >
                  {row?.stored ? row.greenCount : dash}
                </td>
              );
            })}
            {blankAverage()}
          </tr>
          <tr>
            <th className={labelCell}>{text.runningBalance.forSale}</th>
            {columns.map((week) => (
              <td key={weekId(week)} className={numCell}>
                <input
                  aria-label={`${text.runningBalance.forSale} ${weekLabel(week, true)}`}
                  className={inputClass}
                  value={fieldValue(week, 'forSale')}
                  onChange={(e) =>
                    setDrafts((d) => ({
                      ...d,
                      [`${weekId(week)}:forSale`]: e.target.value,
                    }))
                  }
                  onBlur={(e) => {
                    void saveDraft(week, 'forSale', e.target.value);
                  }}
                />
              </td>
            ))}
            {blankAverage()}
          </tr>
          <tr>
            <th className={labelCell}>{text.runningBalance.readyAbandonedShop}</th>
            {columns.map((week) => (
              <td key={weekId(week)} className={numCell}>
                <input
                  aria-label={`${text.runningBalance.readyAbandonedShop} ${weekLabel(week, true)}`}
                  className={inputClass}
                  value={fieldValue(week, 'readyAbandonedShop')}
                  onChange={(e) =>
                    setDrafts((d) => ({
                      ...d,
                      [`${weekId(week)}:readyAbandonedShop`]: e.target.value,
                    }))
                  }
                  onBlur={(e) => {
                    void saveDraft(week, 'readyAbandonedShop', e.target.value);
                  }}
                />
              </td>
            ))}
            {blankAverage()}
          </tr>
          <tr>
            <th className={labelCell}>{text.runningBalance.grandTotal}</th>
            {columns.map((week) => {
              const row = shown(week);
              const negative = row?.grandTotal != null && row.grandTotal < 0;
              return (
                <td
                  key={weekId(week)}
                  className={`${numCell} font-semibold ${negative ? 'text-red-600' : ''}`}
                >
                  {row?.grandTotal == null ? dash : money(row.grandTotal)}
                </td>
              );
            })}
            {blankAverage()}
          </tr>
          </tbody>
        </table>
      </section>
      <section className="overflow-x-auto max-h-[70vh]">
        <table className="border-collapse min-w-max w-full">
          <thead>{weekHeads(text.runningBalance.driver, true)}</thead>
          <tbody>
          {data.drivers.map((driver) => {
            const averageNegative = driver.average != null && driver.average < 0;
            const shade = averageNegative
              ? 'bg-red-50'
              : driver.ownerOperator
                ? 'bg-muted/70'
                : 'bg-card';
            const cellShade = averageNegative
              ? 'bg-red-50'
              : driver.ownerOperator
                ? 'bg-muted/40'
                : 'bg-card';
            const rowText = averageNegative ? 'text-red-600' : '';
            const nameClass = [
              stickyLabel,
              `${shade} font-normal whitespace-nowrap`,
              driver.terminated ? 'line-through' : '',
              rowText,
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <tr key={driver.driverId}>
                <th className={nameClass}>{driver.name}</th>
                {columns.map((week) => {
                  const id = weekId(week);
                  const value = driver.cells[id];
                  const missing = value == null;
                  const firstWeek =
                    !averageNegative && driver.negativeFirstWeekId === id;
                  return (
                    <td
                      key={id}
                      className={`${numCell} ${cellShade} ${rowText} ${
                        firstWeek ? 'text-red-600' : ''
                      }`}
                    >
                      {missing ? '' : money(value)}
                    </td>
                  );
                })}
                <td className={`${numCell} ${cellShade} ${rowText}`}>
                  {driver.average == null ? '' : money(driver.average)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </section>
    </div>
  );
}
