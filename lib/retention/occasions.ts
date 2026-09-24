/**
 * Occasion calendar helpers (America/Chicago).
 * Birthday = drivers.dob month/day (wish only)
 * Anniversary = 3 mo, 6 mo, 1 year, then every year on hire anniversary
 * Holidays = all US federal + Truck Driver Appreciation Week
 */

export type HolidayDef = {
  key: string;
  name: string;
  month?: number;
  day?: number;
  dateForYear?: (year: number) => { month: number; day: number };
  /** Multi-day observance: match any day in range for the year */
  rangeForYear?: (year: number) => { start: Date; end: Date };
  /** If true, only fire on the first day of the range */
  rangeSendOnStartOnly?: boolean;
};

export type MonthDay = { month: number; day: number };

export type AnniversaryMilestone =
  | { kind: "months"; months: 3 | 6; occasionKey: string }
  | { kind: "years"; years: number; occasionKey: string };

/** nth weekday of month (n=1..5, weekday 0=Sun..6=Sat). */
function nthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
  n: number
): MonthDay {
  const first = new Date(Date.UTC(year, month - 1, 1));
  let day = 1 + ((weekday - first.getUTCDay() + 7) % 7);
  day += (n - 1) * 7;
  return { month, day };
}

function thanksgiving(year: number) {
  return nthWeekdayOfMonth(year, 11, 4, 4);
}

function memorialDay(year: number) {
  const last = new Date(Date.UTC(year, 5, 0));
  const day = last.getUTCDate() - ((last.getUTCDay() + 6) % 7);
  return { month: 5, day };
}

function laborDay(year: number) {
  return nthWeekdayOfMonth(year, 9, 1, 1);
}

function mlkDay(year: number) {
  return nthWeekdayOfMonth(year, 1, 1, 3);
}

function presidentsDay(year: number) {
  return nthWeekdayOfMonth(year, 2, 1, 3);
}

function columbusDay(year: number) {
  return nthWeekdayOfMonth(year, 10, 1, 2);
}

/** National Truck Driver Appreciation Week — week starting the 2nd Sunday of September. */
function truckerAppreciationWeek(year: number): { start: Date; end: Date } {
  const secondSunday = nthWeekdayOfMonth(year, 9, 0, 2);
  const start = new Date(Date.UTC(year, 8, secondSunday.day));
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return { start, end };
}

/** All US federal holidays + Truck Driver Appreciation Week. */
export const US_HOLIDAYS: HolidayDef[] = [
  { key: "new_years", name: "New Year's Day", month: 1, day: 1 },
  { key: "mlk_day", name: "Martin Luther King Jr. Day", dateForYear: mlkDay },
  { key: "presidents_day", name: "Presidents' Day", dateForYear: presidentsDay },
  { key: "memorial_day", name: "Memorial Day", dateForYear: memorialDay },
  { key: "juneteenth", name: "Juneteenth", month: 6, day: 19 },
  { key: "independence_day", name: "Independence Day", month: 7, day: 4 },
  { key: "labor_day", name: "Labor Day", dateForYear: laborDay },
  {
    key: "trucker_appreciation",
    name: "National Truck Driver Appreciation Week",
    rangeForYear: truckerAppreciationWeek,
    rangeSendOnStartOnly: true,
  },
  {
    key: "columbus_day",
    name: "Columbus Day",
    dateForYear: columbusDay,
  },
  { key: "veterans_day", name: "Veterans Day", month: 11, day: 11 },
  { key: "thanksgiving", name: "Thanksgiving", dateForYear: thanksgiving },
  { key: "christmas", name: "Christmas", month: 12, day: 25 },
];

export function monthDayFromIso(isoDate: string | null | undefined): MonthDay | null {
  if (!isoDate) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(isoDate).slice(0, 10));
  if (!m) return null;
  return { month: Number(m[2]), day: Number(m[3]) };
}

export function sameMonthDay(a: MonthDay, b: MonthDay): boolean {
  return a.month === b.month && a.day === b.day;
}

export function todayMonthDay(now = new Date()): MonthDay {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: process.env.APP_TIMEZONE || "America/Chicago",
    month: "numeric",
    day: "numeric",
    year: "numeric",
  });
  const parts = fmt.formatToParts(now);
  return {
    month: Number(parts.find((p) => p.type === "month")?.value),
    day: Number(parts.find((p) => p.type === "day")?.value),
  };
}

export function todayYear(now = new Date()): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: process.env.APP_TIMEZONE || "America/Chicago",
    year: "numeric",
  });
  return Number(fmt.format(now));
}

/** Calendar date YYYY-MM-DD in APP_TIMEZONE. */
export function todayIsoDate(now = new Date()): string {
  const md = todayMonthDay(now);
  const y = todayYear(now);
  return `${y}-${String(md.month).padStart(2, "0")}-${String(md.day).padStart(2, "0")}`;
}

function addMonthsIso(iso: string, months: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.slice(0, 10));
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const targetYear = y + Math.floor((mo - 1 + months) / 12);
  const normalizedMonth = (((mo - 1 + months) % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  const out = new Date(Date.UTC(targetYear, normalizedMonth, day));
  return out.toISOString().slice(0, 10);
}

export function holidaysOn(md: MonthDay, year: number, now = new Date()): HolidayDef[] {
  const today = todayIsoDate(now);
  return US_HOLIDAYS.filter((h) => {
    if (h.rangeForYear) {
      const { start, end } = h.rangeForYear(year);
      const startIso = start.toISOString().slice(0, 10);
      const endIso = end.toISOString().slice(0, 10);
      if (h.rangeSendOnStartOnly) return today === startIso;
      return today >= startIso && today <= endIso;
    }
    const d = h.dateForYear
      ? h.dateForYear(year)
      : { month: h.month!, day: h.day! };
    return sameMonthDay(d, md);
  });
}

/**
 * Which anniversary milestone (if any) falls on `todayIso` for this hire date.
 * Milestones: 3 months, 6 months, 1 year, every year after.
 */
export function anniversaryMilestoneOn(
  hireDateIso: string,
  todayIso: string
): AnniversaryMilestone | null {
  const hire = hireDateIso.slice(0, 10);
  const today = todayIso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hire) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) {
    return null;
  }

  const three = addMonthsIso(hire, 3);
  if (three === today) {
    return { kind: "months", months: 3, occasionKey: `anniversary-3mo-${today.slice(0, 4)}` };
  }
  const six = addMonthsIso(hire, 6);
  if (six === today) {
    return { kind: "months", months: 6, occasionKey: `anniversary-6mo-${today.slice(0, 4)}` };
  }

  const hireMd = monthDayFromIso(hire);
  const todayMd = monthDayFromIso(today);
  if (!hireMd || !todayMd || !sameMonthDay(hireMd, todayMd)) return null;

  const hireYear = Number(hire.slice(0, 4));
  const todayYearNum = Number(today.slice(0, 4));
  const years = todayYearNum - hireYear;
  if (years < 1) return null;
  // Skip year-0 same calendar day (hire day itself)
  if (years === 0) return null;
  return {
    kind: "years",
    years,
    occasionKey: `anniversary-${years}y-${todayYearNum}`,
  };
}
