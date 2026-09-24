import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { listAssignmentsPaged } from '@/lib/sources/assignments';

// GET /api/assignments?page=1&pageSize=25&search=&currentOnly=1
export async function GET(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const sp = new URL(request.url).searchParams;
  const search = sp.get('search') ?? '';
  const currentOnly = sp.get('currentOnly') === '1';
  const page = Math.max(1, Number(sp.get('page')) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(sp.get('pageSize')) || 25));
  try {
    const { assignments, total } = await listAssignmentsPaged({
      search,
      currentOnly,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    return NextResponse.json({ assignments, total, page, pageSize });
  } catch (error) {
    console.error('[assignments] failed to load:', error);
    return NextResponse.json({ error: 'Failed to load assignments' }, { status: 500 });
  }
}
