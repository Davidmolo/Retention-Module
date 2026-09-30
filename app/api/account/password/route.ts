import { NextRequest, NextResponse } from 'next/server';
import { changePassword, getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  let body: { currentPassword?: string; newPassword?: string; confirmPassword?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const currentPassword = String(body.currentPassword || '');
  const newPassword = String(body.newPassword || '');
  const confirmPassword = String(body.confirmPassword || '');

  if (!currentPassword || !newPassword) {
    return NextResponse.json(
      { ok: false, error: 'Current and new password are required' },
      { status: 400 }
    );
  }
  if (newPassword !== confirmPassword) {
    return NextResponse.json(
      { ok: false, error: 'New password and confirmation do not match' },
      { status: 400 }
    );
  }

  const result = await changePassword({
    userId: user.id,
    currentPassword,
    newPassword,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
