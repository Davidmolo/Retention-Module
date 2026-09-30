'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Navigation } from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { ManagePermissionsPanel } from '@/components/ManagePermissionsPanel';
import {
  ALL_MODULES,
  isAdminRole,
  isSuperAdminRole,
  type AppModule,
  type UserRole,
} from '@/lib/roles';

type MeUser = {
  id: number;
  username: string;
  role: UserRole;
  modules: AppModule[];
  displayName?: string | null;
};

type PendingInvite = {
  id: number;
  email: string;
  role: UserRole;
  modules: AppModule[];
  expiresAt: string;
  createdAt: string;
};

const MODULE_OPTIONS: { id: AppModule; label: string }[] = [
  { id: 'gross-profit', label: 'Gross Profit' },
  { id: 'retention', label: 'Retention' },
  { id: 'detention', label: 'Detention' },
];

function roleLabel(role: UserRole | string): string {
  if (role === 'super_admin') return 'Super Admin';
  if (role === 'staff' || role === 'retention') return 'Staff';
  return 'Admin';
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function SettingsPage() {
  const [user, setUser] = useState<MeUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState('');
  const [profileMsg, setProfileMsg] = useState('');
  const [profileErr, setProfileErr] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const [pwErr, setPwErr] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('admin');
  const [inviteModules, setInviteModules] = useState<AppModule[]>([
    'gross-profit',
    'retention',
  ]);
  const [inviteMsg, setInviteMsg] = useState('');
  const [inviteErr, setInviteErr] = useState('');
  const [inviteSaving, setInviteSaving] = useState(false);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);

  const canManageUsers = user ? isAdminRole(user.role) : false;
  const isSuper = user ? isSuperAdminRole(user.role) : false;
  const invitePicksModules =
    inviteRole !== 'admin' && inviteRole !== 'super_admin';

  const loadInvites = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/invites', { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.ok && Array.isArray(json.invites)) {
        setPendingInvites(json.invites);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json?.ok && json.user) {
          setUser(json.user);
          setDisplayName(json.user.displayName || '');
        }
      })
      .catch(() => {
        /* ignore */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (canManageUsers) void loadInvites();
  }, [canManageUsers, loadInvites]);

  const toggleModule = (mod: AppModule) => {
    setInviteModules((prev) =>
      prev.includes(mod) ? prev.filter((m) => m !== mod) : [...prev, mod]
    );
  };

  const onSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setProfileMsg('');
    setProfileErr('');
    setProfileSaving(true);
    try {
      const res = await fetch('/api/account/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setProfileErr(json?.error || 'Could not save profile');
        return;
      }
      if (json.user) setUser(json.user);
      setProfileMsg('Profile updated.');
    } catch {
      setProfileErr('Could not save profile');
    } finally {
      setProfileSaving(false);
    }
  };

  const onChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPwMsg('');
    setPwErr('');
    setPwSaving(true);
    try {
      const res = await fetch('/api/account/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setPwErr(json?.error || 'Could not change password');
        return;
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPwMsg('Password updated.');
    } catch {
      setPwErr('Could not change password');
    } finally {
      setPwSaving(false);
    }
  };

  const onSendInvite = async (e: FormEvent) => {
    e.preventDefault();
    setInviteMsg('');
    setInviteErr('');
    setInviteSaving(true);
    try {
      const modules =
        inviteRole === 'admin' || inviteRole === 'super_admin'
          ? ALL_MODULES
          : (['dashboard', ...inviteModules] as AppModule[]);
      if (
        inviteRole !== 'admin' &&
        inviteRole !== 'super_admin' &&
        inviteModules.length === 0
      ) {
        setInviteErr(
          'Select at least one module: Gross Profit, Retention, or Detention'
        );
        setInviteSaving(false);
        return;
      }
      const res = await fetch('/api/settings/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail,
          role: inviteRole,
          modules,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setInviteErr(json?.error || 'Could not send invite');
        return;
      }
      setInviteEmail('');
      setInviteMsg(
        json.mockedEmail
          ? `Invite created for ${json.invite.email} (email mocked — SMTP not configured on this server).`
          : `Invitation sent to ${json.invite.email}. They only set a password — module access is already decided by you.`
      );
      await loadInvites();
    } catch {
      setInviteErr('Could not send invite');
    } finally {
      setInviteSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background md:pl-60 pt-14 md:pt-0">
      <Navigation currentPage="settings" />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your account
            {canManageUsers ? ' and invite users with module access' : ''}.
          </p>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !user ? (
          <p className="text-sm text-destructive">
            Session expired.{' '}
            <Link href="/login" className="underline">
              Sign in again
            </Link>
          </p>
        ) : (
          <div className="space-y-8">
            <section className="rounded-lg border border-border bg-card p-6 space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-card-foreground">
                  Profile
                </h2>
                <p className="text-sm text-muted-foreground">
                  Signed in as{' '}
                  <span className="font-medium text-foreground">
                    {user.username}
                  </span>
                  {' · '}
                  {roleLabel(user.role)}
                </p>
              </div>

              <form onSubmit={onSaveProfile} className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-card-foreground mb-1">
                    Display name
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Optional"
                    className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                {profileErr ? (
                  <p className="text-sm text-destructive">{profileErr}</p>
                ) : null}
                {profileMsg ? (
                  <p className="text-sm text-green-600">{profileMsg}</p>
                ) : null}
                <Button type="submit" disabled={profileSaving}>
                  {profileSaving ? 'Saving…' : 'Save profile'}
                </Button>
              </form>
            </section>

            <section className="rounded-lg border border-border bg-card p-6 space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-card-foreground">
                  Change password
                </h2>
                <p className="text-sm text-muted-foreground">
                  Use at least 8 characters for your new password.
                </p>
              </div>

              <form onSubmit={onChangePassword} className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-card-foreground mb-1">
                    Current password
                  </label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    autoComplete="current-password"
                    className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-card-foreground mb-1">
                    New password
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                    className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    required
                    minLength={8}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-card-foreground mb-1">
                    Confirm new password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    required
                    minLength={8}
                  />
                </div>
                {pwErr ? <p className="text-sm text-destructive">{pwErr}</p> : null}
                {pwMsg ? <p className="text-sm text-green-600">{pwMsg}</p> : null}
                <Button type="submit" disabled={pwSaving}>
                  {pwSaving ? 'Updating…' : 'Update password'}
                </Button>
              </form>
            </section>

            {canManageUsers ? (
              <section className="rounded-lg border border-border bg-card p-6 space-y-5">
                <div>
                  <h2 className="text-lg font-semibold text-card-foreground">
                    Invite users
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    You decide which XXII modules they can use (Gross Profit,
                    Retention, Detention — one, two, or all). They only open the
                    email link and set a password; they do not choose access.
                    Admins always get every module.
                    {isSuper
                      ? ' Super Admins can also invite other Super Admins.'
                      : ''}
                  </p>
                </div>

                <form onSubmit={onSendInvite} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-card-foreground mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="name@goxxii.com"
                      required
                      className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-card-foreground mb-1">
                      Access type
                    </label>
                    <select
                      value={inviteRole}
                      onChange={(e) =>
                        setInviteRole(e.target.value as UserRole)
                      }
                      className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="admin">
                        Admin — all modules (GP, Retention, Detention)
                      </option>
                      <option value="staff">
                        Staff — choose modules below
                      </option>
                      {isSuper ? (
                        <option value="super_admin">
                          Super Admin — all modules + manage admins
                        </option>
                      ) : null}
                    </select>
                  </div>

                  {invitePicksModules ? (
                    <div>
                      <p className="block text-sm font-medium text-card-foreground mb-2">
                        Modules this user can access
                      </p>
                      <div className="space-y-2">
                        {MODULE_OPTIONS.map((opt) => {
                          const checked = inviteModules.includes(opt.id);
                          return (
                            <label
                              key={opt.id}
                              className="flex items-center gap-2 text-sm text-card-foreground"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleModule(opt.id)}
                                className="rounded border-input"
                              />
                              {opt.label}
                            </label>
                          );
                        })}
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Pick 1, 2, or all three. Dashboard landing is included
                        automatically.
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground rounded-md bg-muted px-3 py-2">
                      This account will see all modules: Gross Profit, Retention,
                      and Detention.
                    </p>
                  )}

                  {inviteErr ? (
                    <p className="text-sm text-destructive">{inviteErr}</p>
                  ) : null}
                  {inviteMsg ? (
                    <p className="text-sm text-green-600">{inviteMsg}</p>
                  ) : null}

                  <Button type="submit" disabled={inviteSaving}>
                    {inviteSaving ? 'Sending…' : 'Send invitation'}
                  </Button>
                </form>

                {pendingInvites.length > 0 ? (
                  <div className="pt-2 border-t border-border">
                    <h3 className="text-sm font-semibold text-card-foreground mb-2">
                      Pending invites
                    </h3>
                    <ul className="space-y-2">
                      {pendingInvites.map((inv) => (
                        <li
                          key={inv.id}
                          className="text-sm rounded-md bg-muted px-3 py-2"
                        >
                          <span className="font-medium text-foreground">
                            {inv.email}
                          </span>
                          <span className="text-muted-foreground">
                            {' '}
                            · {roleLabel(inv.role)} ·{' '}
                            {inv.modules.join(', ')} · expires{' '}
                            {formatWhen(inv.expiresAt)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </section>
            ) : null}

            {canManageUsers && user ? (
              <ManagePermissionsPanel
                currentUserId={user.id}
                actorRole={user.role}
              />
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}
