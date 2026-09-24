import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import {
  isValidPrepass,
  setStoredPrepass,
} from '@/lib/sources/weeklySummary';

// PUT /api/gross-profit/prepass
// Body: { year, week, driverId, prepass }
// Recomputes Total Expenses and Gross Profit.
export async function PUT(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    year?: unknown;
    week?: unknown;
    driverId?: unknown;
    prepass?: unknown;
  } | null;
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const year = Number(body.year);
  const week = Number(body.week);
  const driverId = Number(body.driverId);
  const prepass = Number(body.prepass);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(week) ||
    week < 1 ||
    week > 53 ||
    !Number.isInteger(driverId) ||
    driverId <= 0
  ) {
    return NextResponse.json(
      { error: 'year, week and driverId are required' },
      { status: 400 }
    );
  }
  if (!isValidPrepass(prepass)) {
    return NextResponse.json(
      { error: 'prepass is out of range' },
      { status: 400 }
    );
  }

  try {
    const updated = await setStoredPrepass(year, week, driverId, prepass);
    if (!updated) {
      return NextResponse.json(
        { error: 'No stored report row for that week and driver' },
        { status: 404 }
      );
    }
    return NextResponse.json({ year, week, driverId, ...updated });
  } catch (error) {
    console.error('[gross-profit] prepass update failed:', error);
    return NextResponse.json(
      { error: 'Failed to save prepass' },
      { status: 500 }
    );
  }
}
