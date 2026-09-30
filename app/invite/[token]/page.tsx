'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

type InviteInfo = {
  email: string;
  role: string;
  modules: string[];
  moduleLabels: string[];
  expiresAt: string;
};

function roleLabel(role: string): string {
  if (role === 'super_admin') return 'Super Admin';
  if (role === 'retention') return 'Retention';
  return 'Admin';
}

export default function AcceptInvitePage() {
  const params = useParams<{ token: string }>();
  const token = params?.token || '';
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [loadError, setLoadError] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      setLoadError('Invalid invite link');
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetch(`/api/invites/${encodeURIComponent(token)}`, { cache: 'no-store' })
      .then(async (r) => {
        const json = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (!r.ok || !json?.ok) {
          setLoadError(json?.error || 'Invite not found');
          return;
        }
        setInvite(json.invite);
      })
      .catch(() => {
        if (!cancelled) setLoadError('Could not load invite');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const res = await fetch(
        `/api/invites/${encodeURIComponent(token)}/accept`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password, confirmPassword }),
        }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setError(json?.error || 'Could not create account');
        return;
      }
      router.push(
        typeof json.homePath === 'string' ? json.homePath : '/dashboard'
      );
    } catch {
      setError('Could not create account');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md bg-card border border-border rounded-lg shadow-lg p-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt="XXII Century"
          className="h-14 w-auto mx-auto mb-4"
        />
        <h1 className="text-2xl font-bold text-center text-card-foreground mb-1">
          Join XXII Admin
        </h1>
        <p className="text-center text-sm text-muted-foreground mb-6">
          Set your password to finish joining.
        </p>

        {loading ? (
          <p className="text-sm text-muted-foreground text-center">Loading…</p>
        ) : loadError ? (
          <div className="text-sm text-destructive bg-destructive/10 p-3 rounded">
            {loadError}
          </div>
        ) : invite ? (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="rounded-md bg-muted px-3 py-2 text-sm space-y-1">
              <p>
                <span className="text-muted-foreground">Email:</span>{' '}
                <span className="font-medium text-foreground">{invite.email}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Role:</span>{' '}
                <span className="font-medium text-foreground">
                  {roleLabel(invite.role)}
                </span>
              </p>
              <p>
                <span className="text-muted-foreground">Access:</span>{' '}
                <span className="font-medium text-foreground">
                  {(invite.moduleLabels || invite.modules).join(', ')}
                </span>
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-card-foreground mb-1">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
                className="w-full px-4 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-card-foreground mb-1">
                Confirm password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
                className="w-full px-4 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {error ? (
              <div className="text-sm text-destructive bg-destructive/10 p-3 rounded">
                {error}
              </div>
            ) : null}

            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? 'Creating account…' : 'Create account & sign in'}
            </Button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
