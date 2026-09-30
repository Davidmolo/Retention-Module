import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { getPool } from '@/lib/db';
import { sendAppEmail } from '@/lib/mail';
import {
  ALL_MODULES,
  defaultModulesForRole,
  normalizeUserRole,
  parseModulesJson,
  roleHasFullModules,
  type AppModule,
  type UserRole,
} from '@/lib/roles';

export type InviteStatus = 'pending' | 'accepted' | 'revoked';

export type UserInvite = {
  id: number;
  token: string;
  email: string;
  role: UserRole;
  modules: AppModule[];
  invitedBy: number | null;
  status: InviteStatus;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
};

interface InviteRow extends RowDataPacket {
  id: number;
  token: string;
  email: string;
  role: string;
  modules_json: string;
  invited_by: number | null;
  status: string;
  expires_at: Date | string;
  accepted_at: Date | string | null;
  created_at: Date | string;
}

const INVITE_TTL_DAYS = 7;

export const MODULE_LABELS: Record<AppModule, string> = {
  dashboard: 'Dashboard',
  'gross-profit': 'Gross Profit',
  retention: 'Retention',
  detention: 'Detention (coming soon)',
};

export function appBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    (process.env.NODE_ENV === 'production'
      ? 'https://v2.goxxii.com'
      : 'http://localhost:3000');
  return raw.replace(/\/$/, '');
}

export function displayNameFromEmail(email: string): string {
  const local = String(email || '').split('@')[0] || '';
  if (!local) return '';
  return local.charAt(0).toUpperCase() + local.slice(1);
}

export function normalizeInviteEmail(email: string): string {
  return String(email || '').trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function toIso(v: Date | string | null | undefined): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString();
}

function mapInvite(row: InviteRow): UserInvite {
  const role = normalizeUserRole(row.role);
  return {
    id: row.id,
    token: row.token,
    email: row.email,
    role,
    modules: parseModulesJson(row.modules_json, role),
    invitedBy: row.invited_by,
    status: (row.status as InviteStatus) || 'pending',
    expiresAt: toIso(row.expires_at) || '',
    acceptedAt: toIso(row.accepted_at),
    createdAt: toIso(row.created_at) || '',
  };
}

export function sanitizeInviteModules(
  modules: unknown,
  role: UserRole
): AppModule[] {
  const allowed = new Set<string>(ALL_MODULES);
  const raw = Array.isArray(modules) ? modules.map(String) : [];
  let mods = raw.filter((m): m is AppModule => allowed.has(m));
  if (!mods.includes('dashboard')) mods = ['dashboard', ...mods];
  if (!mods.length) return defaultModulesForRole(role);
  return mods;
}

export function inviteUrl(token: string): string {
  return `${appBaseUrl()}/invite/${encodeURIComponent(token)}`;
}

async function userExists(email: string): Promise<boolean> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT id FROM users WHERE username = ? LIMIT 1`,
    [email]
  );
  return Boolean(rows[0]);
}

export async function createAndSendInvite(opts: {
  email: string;
  role: UserRole;
  modules: AppModule[];
  invitedBy: number;
  /** Role of the person sending the invite (gate super_admin invites). */
  inviterRole: UserRole;
}): Promise<
  | { ok: true; invite: UserInvite; mockedEmail: boolean }
  | { ok: false; error: string }
> {
  const email = normalizeInviteEmail(opts.email);
  if (!isValidEmail(email)) {
    return { ok: false, error: 'Enter a valid email address' };
  }

  let role = normalizeUserRole(opts.role);
  if (role === 'super_admin' && opts.inviterRole !== 'super_admin') {
    return {
      ok: false,
      error: 'Only Super Admins can invite another Super Admin',
    };
  }
  // Regular admins invite as admin or retention only.
  if (opts.inviterRole === 'admin' && role === 'super_admin') {
    role = 'admin';
  }

  // Admins / Super Admins always get every module. Limited users get
  // exactly what the inviter selected (1–3 of GP / Retention / Detention).
  const modules = roleHasFullModules(role)
    ? defaultModulesForRole(role)
    : sanitizeInviteModules(opts.modules, role);

  if (!roleHasFullModules(role)) {
    const flows = modules.filter((m) => m !== 'dashboard');
    if (!flows.length) {
      return {
        ok: false,
        error: 'Select at least one module: Gross Profit, Retention, or Detention',
      };
    }
  }

  if (await userExists(email)) {
    return {
      ok: false,
      error: 'A user with this email already exists',
    };
  }

  const token = crypto.randomBytes(24).toString('base64url');
  const expiresAt = new Date(
    Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000
  );

  const pool = getPool();
  // Revoke any previous pending invites for this email.
  await pool.query(
    `UPDATE user_invites SET status = 'revoked'
     WHERE email = ? AND status = 'pending'`,
    [email]
  );

  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO user_invites
       (token, email, role, modules_json, invited_by, status, expires_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
    [
      token,
      email,
      role,
      JSON.stringify(modules),
      opts.invitedBy,
      expiresAt,
    ]
  );

  const invite: UserInvite = {
    id: result.insertId,
    token,
    email,
    role,
    modules,
    invitedBy: opts.invitedBy,
    status: 'pending',
    expiresAt: expiresAt.toISOString(),
    acceptedAt: null,
    createdAt: new Date().toISOString(),
  };

  const link = inviteUrl(token);
  const moduleList = modules
    .map((m) => MODULE_LABELS[m] || m)
    .join(', ');
  const roleLabel =
    role === 'super_admin'
      ? 'Super Admin'
      : role === 'retention'
        ? 'Retention'
        : 'Admin';

  const text = [
    `You've been invited to XXII Admin.`,
    ``,
    `Role: ${roleLabel}`,
    `Modules: ${moduleList}`,
    ``,
    `Open this link to set your password and join:`,
    link,
    ``,
    `This invite expires in ${INVITE_TTL_DAYS} days.`,
    ``,
    `If you did not expect this email, you can ignore it.`,
  ].join('\n');

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#0f172a;">
    <h1 style="font-size:20px;margin:0 0 12px;">You're invited to XXII Admin</h1>
    <p style="font-size:14px;line-height:1.5;color:#334155;">
      You've been given access to XXII Century. Set your password to get started.
    </p>
    <p style="font-size:14px;line-height:1.5;color:#334155;">
      <strong>Role:</strong> ${roleLabel}<br/>
      <strong>Modules:</strong> ${moduleList}
    </p>
    <p style="margin:24px 0;">
      <a href="${link}"
         style="display:inline-block;background:#1e4d9c;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600;">
        Set your password
      </a>
    </p>
    <p style="font-size:12px;color:#64748b;line-height:1.5;">
      Or paste this link into your browser:<br/>
      <a href="${link}" style="color:#1e4d9c;word-break:break-all;">${link}</a>
    </p>
    <p style="font-size:12px;color:#94a3b8;">
      This invite expires in ${INVITE_TTL_DAYS} days.
    </p>
  </div>`;

  const mail = await sendAppEmail({
    to: email,
    subject: 'Your invitation to XXII Admin',
    text,
    html,
  });

  if (!mail.ok) {
    await pool.query(
      `UPDATE user_invites SET status = 'revoked' WHERE id = ?`,
      [invite.id]
    );
    return {
      ok: false,
      error: mail.error || 'Failed to send invitation email',
    };
  }

  return { ok: true, invite, mockedEmail: mail.mocked };
}

export async function getInviteByToken(
  token: string
): Promise<UserInvite | null> {
  const [rows] = await getPool().query<InviteRow[]>(
    `SELECT * FROM user_invites WHERE token = ? LIMIT 1`,
    [token]
  );
  const row = rows[0];
  return row ? mapInvite(row) : null;
}

export async function listPendingInvites(): Promise<UserInvite[]> {
  const [rows] = await getPool().query<InviteRow[]>(
    `SELECT * FROM user_invites
     WHERE status = 'pending'
     ORDER BY created_at DESC
     LIMIT 100`
  );
  return rows.map(mapInvite);
}

export async function acceptInvite(opts: {
  token: string;
  password: string;
}): Promise<
  | { ok: true; username: string }
  | { ok: false; error: string }
> {
  const invite = await getInviteByToken(opts.token);
  if (!invite) return { ok: false, error: 'Invite not found' };
  if (invite.status !== 'pending') {
    return { ok: false, error: 'This invite is no longer valid' };
  }
  if (new Date(invite.expiresAt).getTime() < Date.now()) {
    await getPool().query(
      `UPDATE user_invites SET status = 'revoked' WHERE id = ?`,
      [invite.id]
    );
    return { ok: false, error: 'This invite has expired' };
  }

  const password = String(opts.password || '');
  if (password.length < 8) {
    return { ok: false, error: 'Password must be at least 8 characters' };
  }

  if (await userExists(invite.email)) {
    return { ok: false, error: 'A user with this email already exists' };
  }

  const hash = await bcrypt.hash(password, 10);
  const displayName = displayNameFromEmail(invite.email);
  const pool = getPool();

  await pool.query(
    `INSERT INTO users (username, password_hash, role, display_name, modules_json)
     VALUES (?, ?, ?, ?, ?)`,
    [
      invite.email,
      hash,
      invite.role,
      displayName || null,
      JSON.stringify(invite.modules),
    ]
  );

  await pool.query(
    `UPDATE user_invites
     SET status = 'accepted', accepted_at = CURRENT_TIMESTAMP(3)
     WHERE id = ?`,
    [invite.id]
  );

  return { ok: true, username: invite.email };
}
