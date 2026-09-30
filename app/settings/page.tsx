'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { Navigation } from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { isAdminRole, isSuperAdminRole, type AppModule, type UserRole } from '@/lib/roles';

type MeUser = {
  id: number;
  username: string;
  role: UserRole;
  modules: AppModule[];
  displayName?: string | null;
};

function roleLabel(role: UserRole): string {
  if (role === 'super_admin') return 'Super Admin';
  if (role === 'retention') return 'Retention';
  return 'Admin';
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

  const canManageUsers = user ? isAdminRole(user.role) : false;
  const isSuper = user ? isSuperAdminRole(user.role) : false;

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

  return (
    <div className="min-h-screen bg-background md:pl-60 pt-14 md:pt-0">
      <Navigation currentPage="settings" />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your account. Admins can invite users and set module access.
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
                  Signed in as <span className="font-medium text-foreground">{user.username}</span>
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
              <section className="rounded-lg border border-border bg-card p-6 space-y-3">
                <div>
                  <h2 className="text-lg font-semibold text-card-foreground">
                    Invite users
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Admins can invite by email, choose a role, and select modules.
                    Invite-link flow is next — Super Admins
                    {isSuper ? ' (you)' : ''} can also remove admins when that ships.
                  </p>
                </div>
                <p className="text-sm text-muted-foreground rounded-md bg-muted px-3 py-2">
                  Coming soon: email invite → role → modules → set password link.
                </p>
              </section>
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}
