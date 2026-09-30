import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import {
  deleteManagedUser,
  updateManagedUser,
} from '@/lib/usersAdmin';
import {
  isSuperAdminRole,
  normalizeUserRole,
  type AppModule,
  type UserRole,
} from '@/lib/roles';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const actor = await getAuthUser();
  if (!actor || !isSuperAdminRole(actor.role)) {
    return NextResponse.json(
      { ok: false, error: 'Forbidden — Super Admin only' },
      { status: 403 }
    );
  }

  const { id } = await ctx.params;
  const targetId = Number(id);
  if (!Number.isFinite(targetId) || targetId <= 0) {
    return NextResponse.json(
      { ok: false, error: 'Invalid user id' },
      { status: 400 }
    );
  }

  let body: { role?: string; modules?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const result = await updateManagedUser({
    actorId: actor.id,
    actorRole: actor.role,
    targetId,
    role: normalizeUserRole(body.role) as UserRole,
    modules: (body.modules || []) as AppModule[],
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, user: result.user });
}

export async function DELETE(_request: NextRequest, ctx: Ctx) {
  const actor = await getAuthUser();
  if (!actor || !isSuperAdminRole(actor.role)) {
    return NextResponse.json(
      { ok: false, error: 'Forbidden — Super Admin only' },
      { status: 403 }
    );
  }

  const { id } = await ctx.params;
  const targetId = Number(id);
  if (!Number.isFinite(targetId) || targetId <= 0) {
    return NextResponse.json(
      { ok: false, error: 'Invalid user id' },
      { status: 400 }
    );
  }

  const result = await deleteManagedUser({
    actorId: actor.id,
    actorRole: actor.role,
    targetId,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
