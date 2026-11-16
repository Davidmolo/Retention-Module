import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { getRunningBalance } from '@/lib/runningBalance/load';

export async function GET(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const sp = new URL(request.url).searchParams;
  const yearRaw = sp.get('year');
  const weekRaw = sp.get('week');
  let requested: { year: number; week: number } | undefined;
  if (yearRaw != null || weekRaw != null) {
    const year = Number(yearRaw);
    const week = Number(weekRaw);
    if (!Number.isInteger(year) || !Number.isInteger(week) || week < 1 || week > 53) {
      return NextResponse.json({ error: 'year and week are required' }, { status: 400 });
    }
    requested = { year, week };
  }
  try {
    const payload = await getRunningBalance(requested);
    return NextResponse.json(payload);
  } catch (error) {
    console.error('[running-balance] failed:', error);
    return NextResponse.json({ error: 'Failed to build running balance' }, { status: 500 });
  }
}
