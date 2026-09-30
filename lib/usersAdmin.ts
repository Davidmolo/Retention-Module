import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { getPool } from '@/lib/db';
import {
  ALL_MODULES,
  defaultModulesForRole,
  isAdminRole,
  isSuperAdminRole,
  normalizeUserRole,
  parseModulesJson,
  roleHasFullModules,
  type AppModule,
  type UserRole,
} from '@/lib/roles';

export type ManagedUser = {
  id: number;
  username: string;
  role: UserRole;
  modules: AppModule[];
  displayName: string | null;
  createdAt: string | null;
};

interface UserRow extends RowDataPacket {
  id: number;
  username: string;
  role: string | null;
  display_name: string | null;
  modules_json: string | null;
  created_at: Date | string | null;
}

function toIso(v: Date | string | null | undefined): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString();
}

function mapUser(row: UserRow): ManagedUser {
  const role = normalizeUserRole(row.role);
  return {
    id: row.id,
    username: row.username,
    role,
    modules: parseModulesJson(row.modules_json, role),
    displayName: row.display_name || null,
    createdAt: toIso(row.created_at),
  };
}

export function sanitizeManagedModules(
  role: UserRole,
  modules: unknown
): AppModule[] {
  if (roleHasFullModules(role)) return defaultModulesForRole(role);
  const allowed = new Set<string>(ALL_MODULES);
  const raw = Array.isArray(modules) ? modules.map(String) : [];
  let mods = raw.filter((m): m is AppModule => allowed.has(m));
  if (!mods.includes('dashboard')) mods = ['dashboard', ...mods];
  const flows = mods.filter((m) => m !== 'dashboard');
  if (!flows.length) {
    return defaultModulesForRole('staff');
  }
  return mods;
}

/**
 * Permission matrix:
 * - Super Admin: update/remove Admin + Staff (+ other Super Admins except last/self)
 * - Admin: add Admin via invite; update/remove Staff only; cannot remove Admin
 * - Staff: no manage access
 */
export function canListManagedUsers(actorRole: UserRole): boolean {
  return isAdminRole(actorRole);
}

export function canUpdateTarget(opts: {
  actorRole: UserRole;
  targetRole: UserRole;
  nextRole: UserRole;
}): { ok: true } | { ok: false; error: string } {
  if (!isAdminRole(opts.actorRole)) {
    return { ok: false, error: 'Forbidden' };
  }

  if (isSuperAdminRole(opts.actorRole)) {
    if (opts.nextRole === 'super_admin' || opts.targetRole === 'super_admin') {
      return { ok: true };
    }
    return { ok: true };
  }

  // Regular Admin
  if (opts.targetRole === 'super_admin' || opts.nextRole === 'super_admin') {
    return {
      ok: false,
      error: 'Admins cannot change Super Admin accounts',
    };
  }
  if (opts.targetRole === 'admin' || opts.nextRole === 'admin') {
    return {
      ok: false,
      error: 'Admins cannot update or remove other Admins (invite only)',
    };
  }
  // Staff only
  if (opts.targetRole !== 'staff' || opts.nextRole !== 'staff') {
    return { ok: false, error: 'Admins can only manage Staff accounts' };
  }
  return { ok: true };
}

export function canRemoveTarget(opts: {
  actorRole: UserRole;
  targetRole: UserRole;
  /** Allow an Admin to delete their own account. */
  isSelf?: boolean;
}): { ok: true } | { ok: false; error: string } {
  if (!isAdminRole(opts.actorRole)) {
    return { ok: false, error: 'Forbidden' };
  }

  if (isSuperAdminRole(opts.actorRole)) {
    return { ok: true };
  }

  // Regular Admin may remove themselves.
  if (opts.isSelf) return { ok: true };

  // Regular Admin: staff only
  if (opts.targetRole === 'staff') return { ok: true };
  if (opts.targetRole === 'admin') {
    return {
      ok: false,
      error: 'Admins can add Admins but cannot remove them',
    };
  }
  return {
    ok: false,
    error: 'Admins cannot remove Super Admins',
  };
}

export async function listManagedUsers(): Promise<ManagedUser[]> {
  const [rows] = await getPool().query<UserRow[]>(
    `SELECT id, username, role, display_name, modules_json, created_at
     FROM users
     ORDER BY
       CASE role
         WHEN 'super_admin' THEN 0
         WHEN 'admin' THEN 1
         ELSE 2
       END,
       username ASC`
  );
  return rows.map(mapUser);
}

export async function countSuperAdmins(): Promise<number> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM users WHERE role = 'super_admin'`
  );
  return Number(rows[0]?.c || 0);
}

export async function updateManagedUser(opts: {
  actorId: number;
  actorRole: UserRole;
  targetId: number;
  role: UserRole;
  modules: AppModule[];
}): Promise<{ ok: true; user: ManagedUser } | { ok: false; error: string }> {
  if (!canListManagedUsers(opts.actorRole)) {
    return { ok: false, error: 'Forbidden' };
  }

  const pool = getPool();
  const [rows] = await pool.query<UserRow[]>(
    `SELECT id, username, role, display_name, modules_json, created_at
     FROM users WHERE id = ? LIMIT 1`,
    [opts.targetId]
  );
  const existing = rows[0];
  if (!existing) return { ok: false, error: 'User not found' };

  const currentRole = normalizeUserRole(existing.role);
  const nextRole = normalizeUserRole(opts.role);

  const gate = canUpdateTarget({
    actorRole: opts.actorRole,
    targetRole: currentRole,
    nextRole,
  });
  if (!gate.ok) return gate;

  if (currentRole === 'super_admin' && nextRole !== 'super_admin') {
    const count = await countSuperAdmins();
    if (count <= 1) {
      return { ok: false, error: 'Cannot demote the last Super Admin' };
    }
  }

  const modules = sanitizeManagedModules(nextRole, opts.modules);

  await pool.query<ResultSetHeader>(
    `UPDATE users
     SET role = ?, modules_json = ?
     WHERE id = ?`,
    [nextRole, JSON.stringify(modules), opts.targetId]
  );

  const [updated] = await pool.query<UserRow[]>(
    `SELECT id, username, role, display_name, modules_json, created_at
     FROM users WHERE id = ? LIMIT 1`,
    [opts.targetId]
  );
  return { ok: true, user: mapUser(updated[0]) };
}

export async function deleteManagedUser(opts: {
  actorId: number;
  actorRole: UserRole;
  targetId: number;
}): Promise<
  { ok: true; deletedSelf: boolean } | { ok: false; error: string }
> {
  if (!canListManagedUsers(opts.actorRole)) {
    return { ok: false, error: 'Forbidden' };
  }

  const deletedSelf = opts.actorId === opts.targetId;

  const pool = getPool();
  const [rows] = await pool.query<UserRow[]>(
    `SELECT id, username, role, display_name, modules_json, created_at
     FROM users WHERE id = ? LIMIT 1`,
    [opts.targetId]
  );
  const existing = rows[0];
  if (!existing) return { ok: false, error: 'User not found' };

  const currentRole = normalizeUserRole(existing.role);
  const gate = canRemoveTarget({
    actorRole: opts.actorRole,
    targetRole: currentRole,
    isSelf: deletedSelf,
  });
  if (!gate.ok) return gate;

  if (currentRole === 'super_admin') {
    const count = await countSuperAdmins();
    if (count <= 1) {
      return { ok: false, error: 'Cannot remove the last Super Admin' };
    }
  }

  await pool.query(`DELETE FROM users WHERE id = ?`, [opts.targetId]);
  try {
    await pool.query(
      `UPDATE user_invites SET status = 'revoked'
       WHERE email = ? AND status = 'pending'`,
      [String(existing.username || '').toLowerCase()]
    );
  } catch {
    /* ignore if invites table missing */
  }

  return { ok: true, deletedSelf };
}
