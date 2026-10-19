import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { setManagedUserPassword } from '@/lib/usersAdmin';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, ctx: Ctx) {
  const actor = await getAuthUser();
  if (!actor) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await ctx.params;
  const targetId = Number(id);
  if (!Number.isFinite(targetId) || targetId <= 0) {
    return NextResponse.json(
      { ok: false, error: 'Invalid user id' },
      { status: 400 }
    );
  }

  let body: { password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const result = await setManagedUserPassword({
    actorId: actor.id,
    actorRole: actor.role,
    targetId,
    password: body.password || '',
  });

  if (!result.ok) {
    const status = result.error === 'User not found' ? 404 : 400;
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.error.includes('Super Admin') ? 403 : status }
    );
  }

  return NextResponse.json({ ok: true });
}
