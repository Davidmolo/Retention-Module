import { NextRequest, NextResponse } from 'next/server';
import { verifyCredentials, setAuthCookie } from '@/lib/auth';
import { signToken } from '@/lib/jwt';

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password required' },
        { status: 400 }
      );
    }

    const user = await verifyCredentials(username, password);

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    const token = await signToken(user);
    await setAuthCookie(token);

    return NextResponse.json(
      { success: true, user: { username: user.username } },
      { status: 200 }
    );
  } catch (error) {
    console.error('[auth] login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
