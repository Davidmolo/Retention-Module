import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { getPool } from './db';
import {
  AUTH_COOKIE_NAME,
  TOKEN_MAX_AGE_SECONDS,
  verifyToken,
  type AuthUser,
} from './jwt';
import {
  normalizeUserRole,
  parseModulesJson,
  type AppModule,
  type UserRole,
} from './roles';

export type { AuthUser };

interface UserRow extends RowDataPacket {
  id: number;
  username: string;
  password_hash: string;
  role?: string | null;
  display_name?: string | null;
  modules_json?: string | null;
}

function rowToAuthUser(user: UserRow): AuthUser {
  const role = normalizeUserRole(user.role);
  return {
    id: user.id,
    username: user.username,
    role,
    modules: parseModulesJson(user.modules_json, role),
    displayName: user.display_name || null,
  };
}

/** Look up a user and verify the password against the stored bcrypt hash. */
export async function verifyCredentials(
  username: string,
  password: string
): Promise<AuthUser | null> {
  const pool = getPool();
  const [rows] = await pool.query<UserRow[]>(
    `SELECT id, username, password_hash, role, display_name, modules_json
     FROM users WHERE username = ? LIMIT 1`,
    [username]
  );
  const user = rows[0];
  if (!user) return null;

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return null;

  return rowToAuthUser(user);
}

export async function getUserById(id: number): Promise<AuthUser | null> {
  const pool = getPool();
  const [rows] = await pool.query<UserRow[]>(
    `SELECT id, username, password_hash, role, display_name, modules_json
     FROM users WHERE id = ? LIMIT 1`,
    [id]
  );
  const user = rows[0];
  if (!user) return null;
  return rowToAuthUser(user);
}

export async function changePassword(opts: {
  userId: number;
  currentPassword: string;
  newPassword: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const pool = getPool();
  const [rows] = await pool.query<UserRow[]>(
    `SELECT id, password_hash FROM users WHERE id = ? LIMIT 1`,
    [opts.userId]
  );
  const user = rows[0];
  if (!user) return { ok: false, error: 'User not found' };

  const match = await bcrypt.compare(opts.currentPassword, user.password_hash);
  if (!match) return { ok: false, error: 'Current password is incorrect' };

  const next = String(opts.newPassword || '');
  if (next.length < 8) {
    return { ok: false, error: 'New password must be at least 8 characters' };
  }

  const hash = await bcrypt.hash(next, 10);
  await pool.query<ResultSetHeader>(
    `UPDATE users SET password_hash = ? WHERE id = ?`,
    [hash, opts.userId]
  );
  return { ok: true };
}

export async function upsertUserAccount(opts: {
  username: string;
  password: string;
  role: UserRole;
  modules?: AppModule[];
  displayName?: string | null;
}) {
  const hash = await bcrypt.hash(opts.password, 10);
  const modulesJson = opts.modules ? JSON.stringify(opts.modules) : null;
  const pool = getPool();
  await pool.query(
    `INSERT INTO users (username, password_hash, role, display_name, modules_json)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       password_hash = VALUES(password_hash),
       role = VALUES(role),
       display_name = VALUES(display_name),
       modules_json = VALUES(modules_json)`,
    [
      opts.username,
      hash,
      opts.role,
      opts.displayName ?? null,
      modulesJson,
    ]
  );
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
