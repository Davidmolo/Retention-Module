import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import type { RowDataPacket } from 'mysql2';
import { getPool } from './db';
import {
  AUTH_COOKIE_NAME,
  TOKEN_MAX_AGE_SECONDS,
  verifyToken,
  type AuthUser,
} from './jwt';

export type { AuthUser };

interface UserRow extends RowDataPacket {
  id: number;
  username: string;
  password_hash: string;
}

/** Look up a user and verify the password against the stored bcrypt hash. */
export async function verifyCredentials(
  username: string,
  password: string
): Promise<AuthUser | null> {
  const pool = getPool();
  const [rows] = await pool.query<UserRow[]>(
    'SELECT id, username, password_hash FROM users WHERE username = ? LIMIT 1',
    [username]
  );
  const user = rows[0];
  if (!user) return null;

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return null;

  return { id: user.id, username: user.username };
}

export async function setAuthCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    path: '/',
    maxAge: TOKEN_MAX_AGE_SECONDS,
  });
}

export async function clearAuthCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE_NAME);
}

/** Returns the authenticated user (decoded from the JWT cookie) or null. */
export async function getAuthUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function isAuthenticated(): Promise<boolean> {
  return (await getAuthUser()) !== null;
}
