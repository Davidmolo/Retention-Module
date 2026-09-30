import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { listManagedUsers } from '@/lib/usersAdmin';
import { isSuperAdminRole } from '@/lib/roles';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getAuthUser();
  if (!user || !isSuperAdminRole(user.role)) {
    return NextResponse.json(
      { ok: false, error: 'Forbidden — Super Admin only' },
      { status: 403 }
    );
  }

  const users = await listManagedUsers();
  return NextResponse.json({ ok: true, users });
}
