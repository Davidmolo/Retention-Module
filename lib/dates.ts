// Convert loose API date/datetime strings into MySQL-safe values. Rejects
// malformed inputs (e.g. a TMS typo like '20323-11-01', a 5-digit year) to null
// so one bad record can't break an INSERT.
//
// OpenRoad timestamps are UTC (…Z). We store America/Chicago wall time so
// DATE(column) week buckets match the client's US fleet calendar (Tue→Mon).

export const APP_TIMEZONE =
  process.env.APP_TIMEZONE?.trim() || 'America/Chicago';

function saneYear(y: number): boolean {
  return y >= 1900 && y <= 2100;
}

/** ISO-ish date → 'YYYY-MM-DD', or null if not a valid, sane date. */
export function toSqlDate(input: unknown): string | null {
  if (input == null) return null;
  const m = String(input).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!saneYear(year) || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  return `${m[1]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Calendar date 'YYYY-MM-DD' in APP_TIMEZONE for an absolute instant. */
export function toAppCalendarDate(input: unknown): string | null {
  if (input == null || input === '') return null;
  const raw = String(input).trim();
  const hasTz = /Z$/i.test(raw) || /[+-]\d{2}:?\d{2}$/.test(raw);
  if (hasTz) {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: APP_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(d);
    const get = (type: string) =>
      parts.find((p) => p.type === type)?.value ?? null;
    const year = get('year');
    const month = get('month');
    const day = get('day');
    if (!year || !month || !day) return null;
    return `${year}-${month}-${day}`;
  }
  return toSqlDate(raw);
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Format an absolute instant as wall-clock datetime in APP_TIMEZONE. */
function formatInAppTz(d: Date): string | null {
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? null;
  const year = get('year');
  const month = get('month');
  const day = get('day');
  let hour = get('hour');
  const minute = get('minute');
  const second = get('second');
  if (!year || !month || !day || hour == null || !minute || !second) return null;
  // Some engines emit "24" for midnight; normalize to 00.
  if (hour === '24') hour = '00';
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

/**
 * ISO-ish datetime → 'YYYY-MM-DD HH:MM:SS' in APP_TIMEZONE when the input has
 * a timezone (Z / ±HH:MM). Naive strings keep their calendar clock as-is
 * (already local / business time).
 */
export function toSqlDateTime(input: unknown): string | null {
  if (input == null || input === '') return null;
  const raw = String(input).trim();
  const hasTz = /Z$/i.test(raw) || /[+-]\d{2}:?\d{2}$/.test(raw);

  if (hasTz) {
    const d = new Date(raw);
    return formatInAppTz(d);
  }

  // Naive: keep stated calendar date/time (fuel cards, etc.).
  const date = toSqlDate(raw);
  if (!date) return null;
  const tm = raw.match(/[T ](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!tm) return `${date} 00:00:00`;
  const hh = pad2(Number(tm[1]));
  return `${date} ${hh}:${tm[2]}:${tm[3] ?? '00'}`;
}

/**
 * OpenRoad TMS timestamps are UTC but often arrive without `Z`. Treat naive
 * values as UTC, then store America/Chicago wall time so DATE() week buckets
 * match the US fleet calendar (Tue→Mon).
 */
export function toSqlDateTimeUtc(input: unknown): string | null {
  if (input == null || input === '') return null;
  const raw = String(input).trim();
  const hasTz = /Z$/i.test(raw) || /[+-]\d{2}:?\d{2}$/.test(raw);
  if (hasTz) return toSqlDateTime(raw);

  const date = toSqlDate(raw);
  if (!date) return null;
  const tm = raw.match(/[T ](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  const hh = tm ? pad2(Number(tm[1])) : '00';
  const mm = tm ? tm[2] : '00';
  const ss = tm && tm[3] != null ? tm[3] : '00';
  return toSqlDateTime(`${date}T${hh}:${mm}:${ss}Z`);
}
