import { NextRequest, NextResponse } from 'next/server';
import { acceptInvite } from '@/lib/invites';
import { setAuthCookie, verifyCredentials } from '@/lib/auth';
import { signToken } from '@/lib/jwt';
import { homePathForRole } from '@/lib/roles';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ token: string }> };

export async function POST(request: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;

  let body: {
    password?: string;
    confirmPassword?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const password = String(body.password || '');
  const confirmPassword = String(body.confirmPassword || '');
  if (password !== confirmPassword) {
    return NextResponse.json(
      { ok: false, error: 'Password and confirmation do not match' },
      { status: 400 }
    );
  }

  const result = await acceptInvite({ token, password });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 400 }
    );
  }

  // Auto sign-in after accepting invite.
  const user = await verifyCredentials(result.username, password);
  if (user) {
    const jwt = await signToken(user);
    await setAuthCookie(jwt);
    return NextResponse.json({
      ok: true,
      username: result.username,
      homePath: homePathForRole(user.role),
    });
  }

  return NextResponse.json({
    ok: true,
    username: result.username,
    homePath: '/login',
  });
}
