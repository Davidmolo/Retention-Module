import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import {
  deleteOoOverride,
  listOoOverrides,
  upsertOoOverride,
} from '@/lib/sources/gpConfig';

function numOrNull(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

// GET /api/configurations/oo-overrides
export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const ooOverrides = await listOoOverrides();
    return NextResponse.json({ ooOverrides });
  } catch (error) {
    console.error('[oo-overrides] GET failed:', error);
    return NextResponse.json(
      { error: 'Failed to load OO overrides' },
      { status: 500 }
    );
  }
}

// POST /api/configurations/oo-overrides — add or update override for a driver
export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const driverId = Number(body.driverId);
  if (!Number.isInteger(driverId) || driverId <= 0) {
    return NextResponse.json({ error: 'driverId required' }, { status: 400 });
  }

  const equipmentLease = numOrNull(body.equipmentLease);
  const pdInsurance = numOrNull(body.pdInsurance);
  const liabilityCredit = numOrNull(body.liabilityCredit);
  const xxiiFeePct = numOrNull(body.xxiiFeePct);

  if (equipmentLease === undefined && 'equipmentLease' in body) {
    return NextResponse.json({ error: 'Invalid equipmentLease' }, { status: 400 });
  }
  if (pdInsurance === undefined && 'pdInsurance' in body) {
    return NextResponse.json({ error: 'Invalid pdInsurance' }, { status: 400 });
  }
  if (pdInsurance != null && pdInsurance < 0) {
    return NextResponse.json(
      { error: 'pdInsurance must be >= 0' },
      { status: 400 }
    );
  }
  if (liabilityCredit === undefined && 'liabilityCredit' in body) {
    return NextResponse.json(
      { error: 'Invalid liabilityCredit' },
      { status: 400 }
    );
  }
  if (liabilityCredit != null && liabilityCredit < 0) {
    return NextResponse.json(
      { error: 'liabilityCredit must be >= 0' },
      { status: 400 }
    );
  }
  if (xxiiFeePct === undefined && 'xxiiFeePct' in body) {
    return NextResponse.json({ error: 'Invalid xxiiFeePct' }, { status: 400 });
  }
  if (
    xxiiFeePct != null &&
    (xxiiFeePct <= 0 || xxiiFeePct >= 100)
  ) {
    return NextResponse.json(
      { error: 'xxiiFeePct must be between 0 and 100' },
      { status: 400 }
    );
  }

  try {
    const override = await upsertOoOverride({
      driverId,
      ...(equipmentLease !== undefined ? { equipmentLease } : {}),
      ...(pdInsurance !== undefined ? { pdInsurance } : {}),
      ...(liabilityCredit !== undefined ? { liabilityCredit } : {}),
      ...(xxiiFeePct !== undefined ? { xxiiFeePct } : {}),
    });
    return NextResponse.json({ override });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to save';
    console.error('[oo-overrides] POST failed:', error);
    const status = msg.includes('not found') ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

// DELETE /api/configurations/oo-overrides?driverId=
export async function DELETE(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const driverId = Number(
    new URL(request.url).searchParams.get('driverId')
  );
  if (!Number.isInteger(driverId) || driverId <= 0) {
    return NextResponse.json({ error: 'driverId required' }, { status: 400 });
  }
  try {
    const ok = await deleteOoOverride(driverId);
    if (!ok) {
      return NextResponse.json({ error: 'Override not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[oo-overrides] DELETE failed:', error);
    return NextResponse.json(
      { error: 'Failed to delete override' },
      { status: 500 }
    );
  }
}
