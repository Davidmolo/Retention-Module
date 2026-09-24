import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { getStoredWeeklySummary } from '@/lib/sources/weeklySummary';

// GET /api/gross-profit?year=2026&week=27&driverType=Owner%20Operator
// Always filters driver_status = active. Optional driverType narrows the sheet.
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
    const summary = await getStoredWeeklySummary(year, week, {
      status: 'active',
      driverType,
    });
    return NextResponse.json(summary);
  } catch (error) {
    console.error('[gross-profit] failed:', error);
    return NextResponse.json({ error: 'Failed to build summary' }, { status: 500 });
  }
}
