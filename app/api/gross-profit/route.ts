import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { ensureGpWeek } from '@/lib/sources/ensureGpWeek';
import { getStoredWeeklySummary } from '@/lib/sources/weeklySummary';

// GET /api/gross-profit?year=2026&week=27&driverType=Owner%20Operator
// Always serves from DB. If the week snapshot is missing, pulls live sources,
// stores the week, then reads DB. Optional driverType narrows the sheet.
// Always filters driver_status = active.
export async function GET(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const sp = new URL(request.url).searchParams;
  const year = Number(sp.get('year'));
  const week = Number(sp.get('week'));
  const driverType = sp.get('driverType') ?? '';
  if (!year || !week) {
    return NextResponse.json(
      { error: 'year and week are required' },
      { status: 400 }
    );
  }
  try {
    const ensured = await ensureGpWeek(year, week);
    const summary = await getStoredWeeklySummary(year, week, {
      status: 'active',
      driverType,
    });
    return NextResponse.json({
      ...summary,
      meta: {
        source: ensured.source,
        storedDrivers: ensured.storedDrivers,
      },
    });
  } catch (error) {
    console.error('[gross-profit] failed:', error);
    return NextResponse.json({ error: 'Failed to build summary' }, { status: 500 });
  }
}
