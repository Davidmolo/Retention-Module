import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { homePathForRole } from '@/lib/roles';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }
  return NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      homePath: homePathForRole(user.role),
    },
  });
}
