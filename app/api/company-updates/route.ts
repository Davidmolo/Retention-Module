import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { listCompanyUpdates } from '@/lib/companyUpdates';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const updates = await listCompanyUpdates();
    return NextResponse.json({ ok: true, updates });
  } catch (e) {
    console.error('[company-updates] list', e);
    return NextResponse.json(
      { ok: false, error: 'Could not load company updates' },
      { status: 500 }
    );
  }
}
