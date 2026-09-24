import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { listTrucksPaged, getTruckStatuses } from '@/lib/sources/trucks';

// GET /api/trucks?page=1&pageSize=25&search=&status=
export async function GET(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const sp = new URL(request.url).searchParams;
  const search = sp.get('search') ?? '';
  const status = sp.get('status') ?? '';
  const page = Math.max(1, Number(sp.get('page')) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(sp.get('pageSize')) || 25));
  try {
    const [{ trucks, total }, statuses] = await Promise.all([
      listTrucksPaged({ search, status, limit: pageSize, offset: (page - 1) * pageSize }),
      getTruckStatuses(),
    ]);
    return NextResponse.json({ trucks, total, page, pageSize, statuses });
  } catch (error) {
    console.error('[trucks] failed to load roster:', error);
    return NextResponse.json({ error: 'Failed to load trucks' }, { status: 500 });
  }
}
