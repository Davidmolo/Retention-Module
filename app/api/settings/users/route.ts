import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { canListManagedUsers, listManagedUsers } from '@/lib/usersAdmin';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getAuthUser();
  if (!user || !canListManagedUsers(user.role)) {
    return NextResponse.json(
      { ok: false, error: 'Forbidden' },
      { status: 403 }
    );
  }

  const users = await listManagedUsers();
  return NextResponse.json({
    ok: true,
    actorRole: user.role,
    users,
  });
}
