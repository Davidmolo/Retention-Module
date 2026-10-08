import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME, verifyToken } from '@/lib/jwt';
import { homePathForRole, pathAllowedForModules } from '@/lib/roles';

// Next.js 16 renamed the `middleware` convention to `proxy` (runs in the Edge
// runtime — keep this file free of Node-only imports like mysql2/bcrypt).
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Public: login, auth APIs, invites, driver survey links, SMS webhooks
  // Detention Gmail OAuth callback + IT setup connect page (key-protected in handlers)
  if (
    path === '/login' ||
    path.startsWith('/api/auth') ||
    path.startsWith('/invite') ||
    path.startsWith('/api/invites') ||
    path.startsWith('/s/') ||
    path.startsWith('/api/survey') ||
    path.startsWith('/api/retention/sms/') ||
    path === '/detention/connect-ar-mailbox' ||
    path.startsWith('/api/detention/gmail/') ||
    path === '/api/detention/intake' ||
    path === '/api/detention/compliance/scan'
  ) {
    return NextResponse.next();
  }

  const protectedPath =
    path.startsWith('/dashboard') ||
    path.startsWith('/settings') ||
    path.startsWith('/admin') ||
    path.startsWith('/gross-profit') ||
    path.startsWith('/retention') ||
    path.startsWith('/detention') ||
    path.startsWith('/api/detention') ||
    path.startsWith('/api/retention') ||
    path.startsWith('/api/account') ||
    path.startsWith('/api/settings') ||
    path.startsWith('/api/feedback') ||
    path.startsWith('/api/company-updates') ||
    path.startsWith('/api/gross-profit') ||
    path.startsWith('/api/drivers') ||
    path.startsWith('/api/data') ||
    path.startsWith('/api/configurations') ||
    path.startsWith('/api/assignments') ||
    path.startsWith('/api/trips') ||
    path.startsWith('/api/trucks') ||
    path.startsWith('/api/tolls') ||
    path.startsWith('/api/sheets');

  if (!protectedPath) {
    return NextResponse.next();
  }

  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const user = token ? await verifyToken(token) : null;

  if (!user) {
    if (path.startsWith('/api/')) {
      const res = NextResponse.json(
        { ok: false, error: 'Unauthorized — please sign in again' },
        { status: 401 }
      );
      res.cookies.delete(AUTH_COOKIE_NAME);
      return res;
    }
    const response = NextResponse.redirect(new URL('/login', request.url));
    response.cookies.delete(AUTH_COOKIE_NAME);
    return response;
  }

  if (!pathAllowedForModules(path, user.modules)) {
    if (path.startsWith('/api/')) {
      return NextResponse.json(
        { ok: false, error: 'Forbidden — you do not have access to this module' },
        { status: 403 }
      );
    }
    return NextResponse.redirect(
      new URL(homePathForRole(user.role), request.url)
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
