import { NextRequest, NextResponse } from 'next/server';
import type { ResultSetHeader } from 'mysql2';
import { getAuthUser, getUserById, setAuthCookie } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { signToken } from '@/lib/jwt';

export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  let body: { displayName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const displayName = String(body.displayName ?? '').trim().slice(0, 255);
  const pool = getPool();
  await pool.query<ResultSetHeader>(
    `UPDATE users SET display_name = ? WHERE id = ?`,
    [displayName || null, user.id]
  );

  const refreshed = await getUserById(user.id);
  if (refreshed) {
    const token = await signToken(refreshed);
    await setAuthCookie(token);
  }

  return NextResponse.json({
    ok: true,
    user: refreshed
      ? {
          id: refreshed.id,
          username: refreshed.username,
          role: refreshed.role,
          modules: refreshed.modules,
          displayName: refreshed.displayName,
        }
      : null,
  });
}
