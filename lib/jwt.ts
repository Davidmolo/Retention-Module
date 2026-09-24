// Edge-safe JWT helpers. Depends ONLY on `jose` (Web Crypto), so this module
// can be imported from proxy.ts (Edge runtime) without pulling in mysql2.
import { SignJWT, jwtVerify } from 'jose';

export interface AuthUser {
  id: number;
  username: string;
}

export const AUTH_COOKIE_NAME = 'auth_token';
export const TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }
  return new TextEncoder().encode(secret);
}

export async function signToken(user: AuthUser): Promise<string> {
  return new SignJWT({ username: user.username })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getSecret());
}

export async function verifyToken(token: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (!payload.sub) return null;
    return {
      id: Number(payload.sub),
      username: String(payload.username ?? ''),
    };
  } catch {
    return null;
  }
}
