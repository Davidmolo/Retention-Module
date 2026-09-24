import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { weekOf, weekRange } from '@/lib/week';
import { listTollTransactions, syncTolls } from '@/lib/prepass/sync';

function previousCompletedWeek(): { year: number; week: number } {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 7);
  return weekOf(d);
}

function parseYearWeek(yearRaw: unknown, weekRaw: unknown): {
  year: number;
  week: number;
} | null {
  const year = Number(yearRaw);
  const week = Number(weekRaw);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return null;
  if (!Number.isInteger(week) || week < 1 || week > 53) return null;
  return { year, week };
}

// GET /api/tolls?year=&week=&page=1&pageSize=50&search=
export async function GET(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sp = new URL(request.url).searchParams;
  let year = Number(sp.get('year'));
  let week = Number(sp.get('week'));
  if (!year || !week) {
    ({ year, week } = previousCompletedWeek());
  }
  const parsed = parseYearWeek(year, week);
  if (!parsed) {
    return NextResponse.json({ error: 'Invalid year or week' }, { status: 400 });
  }

  const page = Math.max(1, Number(sp.get('page')) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(sp.get('pageSize')) || 50));
  const search = sp.get('search') ?? '';
  const { start, end } = weekRange(parsed.year, parsed.week);

  try {
    const result = await listTollTransactions(start, end, {
      vehicleSearch: search,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    return NextResponse.json({
      year: parsed.year,
      week: parsed.week,
      start,
      end,
      page,
      pageSize,
      count: result.count,
      totalCharge: result.totalCharge,
      transactions: result.transactions,
    });
  } catch (error) {
    console.error('[tolls] failed to list transactions:', error);
    return NextResponse.json(
      { error: 'Failed to load toll transactions' },
      { status: 500 }
    );
  }
}

// POST /api/tolls  body: { year, week }
// Syncs PrePass tolls for that week's date range, then returns sync stats.
export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { year?: unknown; week?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = parseYearWeek(body.year, body.week);
  if (!parsed) {
    return NextResponse.json({ error: 'Invalid year or week' }, { status: 400 });
  }

  const { start, end } = weekRange(parsed.year, parsed.week);
  try {
    const sync = await syncTolls({ start, end });
    return NextResponse.json({
      year: parsed.year,
      week: parsed.week,
      ...sync,
    });
  } catch (error) {
    console.error('[tolls] sync failed:', error);
    return NextResponse.json(
      { error: 'Failed to sync toll transactions' },
      { status: 500 }
    );
  }
}
