import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import {
  getStoredWeeklySummary,
  isValidFuelMpg,
  isValidFuelPpg,
  setStoredFuelInputs,
} from '@/lib/sources/weeklySummary';

function parseOptionalFuelField(
  raw: unknown,
  validate: (n: number) => boolean,
  label: string
):
  | { ok: true; provided: false }
  | { ok: true; provided: true; value: number | null }
  | { ok: false; error: string } {
  if (raw === undefined) return { ok: true, provided: false };
  if (raw === null || raw === '') {
    return { ok: true, provided: true, value: null };
  }
  const n = Number(raw);
  if (!validate(n)) {
    return { ok: false, error: `${label} is out of range` };
  }
  return { ok: true, provided: true, value: n };
}

// PUT /api/gross-profit/mpg
// Body: { year, week, driverId, fuelMpg?, fuelPpg? }
// Omitted fields keep their stored value; null / "" clears that field.
// When both MPG and Net P/G are set, Fuel $ = (mileage / MPG) × Net P/G
// and Total Expenses / Gross Profit are recomputed.
export async function PUT(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    year?: unknown;
    week?: unknown;
    driverId?: unknown;
    fuelMpg?: unknown;
    fuelPpg?: unknown;
  } | null;
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const year = Number(body.year);
  const week = Number(body.week);
  const driverId = Number(body.driverId);
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

  const mpgParsed = parseOptionalFuelField(
    body.fuelMpg,
    isValidFuelMpg,
    'fuelMpg'
  );
  if (!mpgParsed.ok) {
    return NextResponse.json({ error: mpgParsed.error }, { status: 400 });
  }
  const ppgParsed = parseOptionalFuelField(
    body.fuelPpg,
    isValidFuelPpg,
    'fuelPpg'
  );
  if (!ppgParsed.ok) {
    return NextResponse.json({ error: ppgParsed.error }, { status: 400 });
  }

  try {
    const summary = await getStoredWeeklySummary(year, week);
    const current = summary.drivers.find((d) => d.driverId === driverId);
    if (!current) {
      return NextResponse.json(
        { error: 'No stored report row for that week and driver' },
        { status: 404 }
      );
    }

    let fuelMpg = current.fuelMpg;
    let fuelPpg = current.fuelPpg;
    if (mpgParsed.provided) {
      fuelMpg =
        mpgParsed.value == null
          ? null
          : Math.round(mpgParsed.value * 100) / 100;
    }
    if (ppgParsed.provided) {
      fuelPpg =
        ppgParsed.value == null
          ? null
          : Math.round(ppgParsed.value * 10000) / 10000;
    }

    const updated = await setStoredFuelInputs(year, week, driverId, {
      fuelMpg,
      fuelPpg,
    });
    if (!updated) {
      return NextResponse.json(
        { error: 'No stored report row for that week and driver' },
        { status: 404 }
      );
    }
    return NextResponse.json({ year, week, driverId, ...updated });
  } catch (error) {
    console.error('[gross-profit] fuel inputs update failed:', error);
    return NextResponse.json(
      { error: 'Failed to save fuel inputs' },
      { status: 500 }
    );
  }
}
