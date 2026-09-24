import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { listDriversPaged, getDriverStatuses } from '@/lib/sources/drivers';

// GET /api/drivers?page=1&pageSize=25&search=&status=
// Server-side paginated + searched roster. Returns { drivers, total, page, pageSize, statuses }.
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
    const [{ drivers, total }, statuses] = await Promise.all([
      listDriversPaged({ search, status, limit: pageSize, offset: (page - 1) * pageSize }),
      getDriverStatuses(),
    ]);
    return NextResponse.json({ drivers, total, page, pageSize, statuses });
  } catch (error) {
    console.error('[drivers] failed to load roster:', error);
    return NextResponse.json({ error: 'Failed to load drivers' }, { status: 500 });
  }
}
