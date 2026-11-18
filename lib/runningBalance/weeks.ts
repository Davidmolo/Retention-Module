import { weekOf, weekRange } from '@/lib/week';

export type YearWeek = { year: number; week: number };

export const VISIBLE_WEEK_COUNT = 7;

export function weekKey(w: YearWeek): number {
  return w.year * 100 + w.week;
}

export function weekId(w: YearWeek): string {
  return `${w.year}-${w.week}`;
}

export function parseWeekId(id: string): YearWeek | null {
  const [y, w] = id.split('-');
  const year = Number(y);
  const week = Number(w);
  if (!Number.isInteger(year) || !Number.isInteger(week) || week < 1 || week > 53) {
    return null;
  }
  return { year, week };
}

export function compareWeeks(a: YearWeek, b: YearWeek): number {
  return weekKey(a) - weekKey(b);
}

export function addWeeks(anchor: YearWeek, delta: number): YearWeek {
  const { start } = weekRange(anchor.year, anchor.week);
  const d = new Date(`${start}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta * 7);
  return weekOf(d);
}

/**
 * A week ends Monday and is shown from the Thursday after that.
 * Week 47 (ends Mon Nov 16) appears Thu Nov 19. Week 48 appears Thu Nov 26.
 */
export function latestReleasedWeek(now = new Date()): YearWeek {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  let cursor = weekOf(new Date(today));
  for (let i = 0; i < 6; i++) {
    const { start } = weekRange(cursor.year, cursor.week);
    const release = new Date(`${start}T00:00:00.000Z`);
    release.setUTCDate(release.getUTCDate() + 9);
    if (release.getTime() <= today) return cursor;
    cursor = addWeeks(cursor, -1);
  }
  return cursor;
}

/** Oldest → newest, ending at `anchor`. */
export function weeksEndingAt(anchor: YearWeek, count: number): YearWeek[] {
  const out: YearWeek[] = [];
  let cur = anchor;
  for (let i = 0; i < count; i++) {
    out.push(cur);
    cur = addWeeks(cur, -1);
  }
  return out.reverse();
}
