import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { getTripCountsByDriver } from '@/lib/sources/trips';

// GET /api/trips[?start=YYYY-MM-DD&end=YYYY-MM-DD]
// Per-driver trip counts from the DB (source for the "Top by Trips" chart).
export async function GET(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const start = searchParams.get('start') || undefined;
  const end = searchParams.get('end') || undefined;
  try {
    const drivers = await getTripCountsByDriver({ start, end });
    return NextResponse.json({ drivers });
  } catch (error) {
    console.error('[trips] failed to load counts:', error);
    return NextResponse.json({ error: 'Failed to load trips' }, { status: 500 });
  }
}
