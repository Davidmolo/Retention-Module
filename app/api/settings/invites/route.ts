import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import {
  createAndSendInvite,
  listPendingInvites,
} from '@/lib/invites';
import {
  isAdminRole,
  isSuperAdminRole,
  normalizeUserRole,
  type AppModule,
  type UserRole,
} from '@/lib/roles';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getAuthUser();
  if (!user || !isAdminRole(user.role)) {
    return NextResponse.json(
      { ok: false, error: 'Forbidden' },
      { status: 403 }
    );
  }

  const invites = await listPendingInvites();
  return NextResponse.json({
    ok: true,
    invites: invites.map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role,
      modules: i.modules,
      expiresAt: i.expiresAt,
      createdAt: i.createdAt,
    })),
  });
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user || !isAdminRole(user.role)) {
    return NextResponse.json(
      { ok: false, error: 'Forbidden — admin access required' },
      { status: 403 }
    );
  }

  // Super Admin + Admin can invite; only Super Admin may grant super_admin.
  let body: {
    email?: string;
    role?: string;
    modules?: string[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const role = normalizeUserRole(body.role) as UserRole;
  if (role === 'super_admin' && !isSuperAdminRole(user.role)) {
    return NextResponse.json(
      { ok: false, error: 'Only Super Admins can invite another Super Admin' },
      { status: 403 }
    );
  }

  const result = await createAndSendInvite({
    email: String(body.email || ''),
    role,
    modules: (body.modules || []) as AppModule[],
    invitedBy: user.id,
    inviterRole: user.role,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    mockedEmail: result.mockedEmail,
    invite: {
      id: result.invite.id,
      email: result.invite.email,
      role: result.invite.role,
      modules: result.invite.modules,
      expiresAt: result.invite.expiresAt,
      createdAt: result.invite.createdAt,
    },
  });
}
