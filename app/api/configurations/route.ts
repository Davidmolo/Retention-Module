import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import {
  getGpExpenseRates,
  listOoDriverConfigs,
  listOoOverrides,
  updateGpExpenseRates,
  type GpExpenseRatesUpdate,
} from '@/lib/sources/gpConfig';

// GET /api/configurations — global rates + OO overrides + all OO effective rows
export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const [rates, ooOverrides, ooDrivers] = await Promise.all([
      getGpExpenseRates(),
      listOoOverrides(),
      listOoDriverConfigs(),
    ]);
    return NextResponse.json({ rates, ooOverrides, ooDrivers });
  } catch (error) {
    console.error('[configurations] GET failed:', error);
    return NextResponse.json(
      { error: 'Failed to load configurations' },
      { status: 500 }
    );
  }
}

function numOrUndef(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function inRange(n: number, min: number, max: number): boolean {
  return n >= min && n <= max;
}

// PUT /api/configurations — update global rates only
export async function PUT(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const partial: GpExpenseRatesUpdate = {};
  const companyRm = numOrUndef(body.companyRmPerMile);
  const ooRm = numOrUndef(body.ooRmPerMile);
  const companyLiab = numOrUndef(body.companyLiabilityPerMile);
  const ooLiab = numOrUndef(body.ooLiabilityPerMile);
  const ooFlat = numOrUndef(body.ooLiabilityFlat);
  const factoring = numOrUndef(body.factoringRate);
  const ooLeaseDefault = numOrUndef(body.ooEquipmentLeaseDefault);

  if (companyRm !== undefined) {
    if (!inRange(companyRm, 0, 5)) {
      return NextResponse.json(
        { error: 'companyRmPerMile out of range' },
        { status: 400 }
      );
    }
    partial.companyRmPerMile = companyRm;
  }
  if (ooRm !== undefined) {
    if (!inRange(ooRm, 0, 5)) {
      return NextResponse.json(
        { error: 'ooRmPerMile out of range' },
        { status: 400 }
      );
    }
    partial.ooRmPerMile = ooRm;
  }
  if (companyLiab !== undefined) {
    if (!inRange(companyLiab, 0, 5)) {
      return NextResponse.json(
        { error: 'companyLiabilityPerMile out of range' },
        { status: 400 }
      );
    }
    partial.companyLiabilityPerMile = companyLiab;
  }
  if (ooLiab !== undefined) {
    if (!inRange(ooLiab, 0, 5)) {
      return NextResponse.json(
        { error: 'ooLiabilityPerMile out of range' },
        { status: 400 }
      );
    }
    partial.ooLiabilityPerMile = ooLiab;
  }
  if (ooFlat !== undefined) {
    if (!inRange(ooFlat, 0, 10_000)) {
      return NextResponse.json(
        { error: 'ooLiabilityFlat out of range' },
        { status: 400 }
      );
    }
    partial.ooLiabilityFlat = ooFlat;
  }
  if (factoring !== undefined) {
    if (!inRange(factoring, 0, 1)) {
      return NextResponse.json(
        { error: 'factoringRate out of range (use decimal, e.g. 0.012)' },
        { status: 400 }
      );
    }
    partial.factoringRate = factoring;
  }
  if (ooLeaseDefault !== undefined) {
    if (!inRange(ooLeaseDefault, -10_000, 10_000)) {
      return NextResponse.json(
        { error: 'ooEquipmentLeaseDefault out of range' },
        { status: 400 }
      );
    }
    partial.ooEquipmentLeaseDefault = ooLeaseDefault;
  }

  if (!Object.keys(partial).length) {
    return NextResponse.json({ error: 'No valid rates to update' }, { status: 400 });
  }

  try {
    const rates = await updateGpExpenseRates(partial);
    return NextResponse.json({ rates });
  } catch (error) {
    console.error('[configurations] PUT failed:', error);
    return NextResponse.json(
      { error: 'Failed to save configurations' },
      { status: 500 }
    );
  }
}
