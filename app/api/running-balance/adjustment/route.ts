import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { saveWeekAdjustment } from '@/lib/runningBalance/load';
import type { WeekAdjustment } from '@/lib/runningBalance/calc';

const MAX_AMOUNT = 10_000_000;

function parseAmount(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || Math.abs(n) > MAX_AMOUNT) return undefined;
  return Math.round(n * 100) / 100;
}

export async function PUT(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as {
    year?: unknown;
    week?: unknown;
    forSale?: unknown;
    readyAbandonedShop?: unknown;
  } | null;
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const year = Number(body.year);
  const week = Number(body.week);
  if (!Number.isInteger(year) || !Number.isInteger(week) || week < 1 || week > 53) {
    return NextResponse.json({ error: 'year and week are required' }, { status: 400 });
  }
  const patch: Partial<WeekAdjustment> = {};
  if ('forSale' in body) {
    const forSale = parseAmount(body.forSale);
    if (forSale === undefined && body.forSale !== undefined) {
      return NextResponse.json({ error: 'forSale is out of range' }, { status: 400 });
    }
    patch.forSale = forSale ?? null;
  }
  if ('readyAbandonedShop' in body) {
    const ready = parseAmount(body.readyAbandonedShop);
    if (ready === undefined && body.readyAbandonedShop !== undefined) {
      return NextResponse.json(
        { error: 'readyAbandonedShop is out of range' },
        { status: 400 }
      );
    }
    patch.readyAbandonedShop = ready ?? null;
  }
  if (!('forSale' in body) && !('readyAbandonedShop' in body)) {
    return NextResponse.json({ error: 'Nothing to save' }, { status: 400 });
  }
  try {
    const saved = await saveWeekAdjustment(year, week, patch);
    return NextResponse.json({ year, week, ...saved });
  } catch (error) {
    console.error('[running-balance] adjustment save failed:', error);
    return NextResponse.json({ error: 'Failed to save adjustment' }, { status: 500 });
  }
}
