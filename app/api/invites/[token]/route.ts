import { NextRequest, NextResponse } from 'next/server';
import { getInviteByToken, MODULE_LABELS } from '@/lib/invites';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ token: string }> };

export async function GET(_request: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;
  const invite = await getInviteByToken(token);
  if (!invite) {
    return NextResponse.json(
      { ok: false, error: 'Invite not found' },
      { status: 404 }
    );
  }

  if (invite.status !== 'pending') {
    return NextResponse.json(
      { ok: false, error: 'This invite is no longer valid' },
      { status: 410 }
    );
  }

  if (new Date(invite.expiresAt).getTime() < Date.now()) {
    return NextResponse.json(
      { ok: false, error: 'This invite has expired' },
      { status: 410 }
    );
  }

  return NextResponse.json({
    ok: true,
    invite: {
      email: invite.email,
      role: invite.role,
      modules: invite.modules,
      moduleLabels: invite.modules.map((m) => MODULE_LABELS[m] || m),
      expiresAt: invite.expiresAt,
    },
  });
}
