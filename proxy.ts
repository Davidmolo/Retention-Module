import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME, verifyToken } from '@/lib/jwt';

// Next.js 16 renamed the `middleware` convention to `proxy` (runs in the Edge
// runtime — keep this file free of Node-only imports like mysql2/bcrypt).
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Public: login, auth APIs, driver survey links, SMS provider webhooks (no JWT)
  if (
    path === '/login' ||
    path.startsWith('/api/auth') ||
    path.startsWith('/s/') ||
    path.startsWith('/api/survey') ||
    path.startsWith('/api/retention/sms/')
  ) {
    return NextResponse.next();
  }

  // Verify the JWT for protected routes (incl. Retention admin + GP)
  if (
    path.startsWith('/dashboard') ||
    path.startsWith('/admin') ||
    path.startsWith('/gross-profit') ||
    path.startsWith('/retention') ||
    path.startsWith('/api/retention')
  ) {
    const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
    const user = token ? await verifyToken(token) : null;

    if (!user) {
      const response = NextResponse.redirect(new URL('/login', request.url));
      response.cookies.delete(AUTH_COOKIE_NAME);
      return response;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
