// Single source of truth for week math. THROUGHOUT THIS PROJECT weeks start on
// TUESDAY and run Tuesday → Monday.
//
// Week 1 of year Y is the Tuesday–Monday week that contains December 28 of
// year Y-1. That keeps business week numbers aligned, e.g. for 2026:
//   W34 = Aug 11–17, W35 = Aug 18–24.
// weekRange() and weekOf() are exact inverses for weeks that belong to a year.

export const WEEK_START_DOW = 2; // 0=Sun, 1=Mon, 2=Tue …
const DAY_MS = 86_400_000;

/** The Tuesday (UTC midnight) at or before `date`. */
function startOfWeek(date: Date): Date {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  const diff = (d.getUTCDay() - WEEK_START_DOW + 7) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  return d;
}

/** Start (Tuesday) of week 1 for a given year. */
function week1Start(year: number): Date {
  // Dec 28 of the previous calendar year (not Jan 4) — fleet week numbering.
  return startOfWeek(new Date(Date.UTC(year - 1, 11, 28)));
}

/** Inclusive Tuesday→Monday date range for (year, week) as 'YYYY-MM-DD'. */
export function weekRange(year: number, week: number): {
  start: string;
  end: string;
} {
  const start = week1Start(year);
  start.setUTCDate(start.getUTCDate() + (week - 1) * 7);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  // console.log({ year, week, start: fmt(start), end: fmt(end) });
  return { start: fmt(start), end: fmt(end) };
}

/** The (year, week) a date falls in, under the Tuesday-start convention. */
export function weekOf(date: Date): { year: number; week: number } {
  const start = startOfWeek(date);
  let year = date.getUTCFullYear();
  if (start.getTime() < week1Start(year).getTime()) year -= 1;
  else if (start.getTime() >= week1Start(year + 1).getTime()) year += 1;
  const week =
    Math.round((start.getTime() - week1Start(year).getTime()) / (7 * DAY_MS)) + 1;
  return { year, week };
}
