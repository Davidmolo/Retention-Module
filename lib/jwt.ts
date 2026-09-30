// Edge-safe JWT helpers. Depends ONLY on `jose` (Web Crypto), so this module
// can be imported from proxy.ts (Edge runtime) without pulling in mysql2.
import { SignJWT, jwtVerify } from 'jose';
import {
  normalizeUserRole,
  parseModulesJson,
  type AppModule,
  type UserRole,
} from './roles';

export type { UserRole, AppModule };

export interface AuthUser {
  id: number;
  username: string;
  role: UserRole;
  /** Module keys the user may open. */
  modules: AppModule[];
  displayName?: string | null;
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
  return new SignJWT({
    username: user.username,
    role: normalizeUserRole(user.role),
    modules: user.modules,
    displayName: user.displayName || null,
  })
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
    const role = normalizeUserRole(payload.role);
    const modulesRaw = Array.isArray(payload.modules)
      ? (payload.modules as string[])
      : [];
    const modules =
      modulesRaw.length > 0
        ? parseModulesJson(JSON.stringify(modulesRaw), role)
        : parseModulesJson(null, role);
    return {
      id: Number(payload.sub),
      username: String(payload.username ?? ''),
      role,
      modules,
      displayName: payload.displayName
        ? String(payload.displayName)
        : null,
    };
  } catch {
    return null;
  }
}
