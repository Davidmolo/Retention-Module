'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  ALL_MODULES,
  isSuperAdminRole,
  type AppModule,
  type UserRole,
} from '@/lib/roles';

type ManagedUser = {
  id: number;
  username: string;
  role: UserRole;
  modules: AppModule[];
  displayName: string | null;
};

const FLOW_MODULES: { id: AppModule; label: string }[] = [
  { id: 'gross-profit', label: 'Gross Profit' },
  { id: 'retention', label: 'Retention' },
  { id: 'detention', label: 'Detention' },
];

function roleLabel(role: UserRole | string): string {
  if (role === 'super_admin') return 'Super Admin';
  if (role === 'staff' || role === 'retention') return 'Staff';
  return 'Admin';
}

type Draft = {
  role: UserRole;
  modules: AppModule[];
};

export function ManagePermissionsPanel({
  currentUserId,
  actorRole,
}: {
  currentUserId: number;
  actorRole: UserRole;
}) {
  const isSuper = isSuperAdminRole(actorRole);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const canEditUser = (u: ManagedUser) => {
    if (isSuper) return true;
    // Admin: staff only
    return u.role === 'staff';
  };

  const canRemoveUser = (u: ManagedUser) => {
    if (u.id === currentUserId) return false;
    if (isSuper) return true;
    return u.role === 'staff';
  };

  const loadUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/users', { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setErr(json?.error || 'Could not load users');
        return;
      }
      const list = (json.users || []) as ManagedUser[];
      setUsers(list);
      const next: Record<number, Draft> = {};
      for (const u of list) {
        next[u.id] = {
          role: u.role,
          modules: u.modules.filter((m) => m !== 'dashboard') as AppModule[],
        };
      }
      setDrafts(next);
      setErr('');
    } catch {
      setErr('Could not load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const setDraftRole = (id: number, role: UserRole) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: {
        role,
        modules:
          role === 'admin' || role === 'super_admin'
            ? (['gross-profit', 'retention', 'detention'] as AppModule[])
            : prev[id]?.modules?.length
              ? prev[id].modules
              : (['retention'] as AppModule[]),
      },
    }));
  };

  const toggleModule = (id: number, mod: AppModule) => {
    setDrafts((prev) => {
      const cur = prev[id] || { role: 'staff' as UserRole, modules: [] };
      if (cur.role === 'admin' || cur.role === 'super_admin') return prev;
      const has = cur.modules.includes(mod);
      return {
        ...prev,
        [id]: {
          ...cur,
          modules: has
            ? cur.modules.filter((m) => m !== mod)
            : [...cur.modules, mod],
        },
      };
    });
  };

  const onSave = async (id: number) => {
    const draft = drafts[id];
    if (!draft) return;
    setBusyId(id);
    setMsg('');
    setErr('');
    try {
      const modules =
        draft.role === 'admin' || draft.role === 'super_admin'
          ? ALL_MODULES
          : (['dashboard', ...draft.modules] as AppModule[]);
      if (
        draft.role === 'staff' &&
        draft.modules.filter((m) => m !== 'dashboard').length === 0
      ) {
        setErr('Staff need at least one module');
        setBusyId(null);
        return;
      }
      const res = await fetch(`/api/settings/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: draft.role, modules }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setErr(json?.error || 'Could not update user');
        return;
      }
      setMsg(`Updated ${json.user.username}`);
      await loadUsers();
    } catch {
      setErr('Could not update user');
    } finally {
      setBusyId(null);
    }
  };

  const onRemove = async (u: ManagedUser) => {
    if (!canRemoveUser(u)) {
      setErr(
        u.role === 'admin'
          ? 'Admins can add Admins but cannot remove them'
          : 'You cannot remove this user'
      );
      return;
    }
    if (
      !window.confirm(
        `Remove ${u.username}? They will lose access immediately.`
      )
    ) {
      return;
    }
    setBusyId(u.id);
    setMsg('');
    setErr('');
    try {
      const res = await fetch(`/api/settings/users/${u.id}`, {
        method: 'DELETE',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setErr(json?.error || 'Could not remove user');
        return;
      }
      setMsg(`Removed ${u.username}`);
      await loadUsers();
    } catch {
      setErr('Could not remove user');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="rounded-lg border border-border bg-card p-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-card-foreground">
          Manage permissions
        </h2>
        <p className="text-sm text-muted-foreground">
          {isSuper
            ? 'Super Admin: update or remove Admins and Staff. Use Invite to add users.'
            : 'Admin: invite Admins or Staff; update or remove Staff only. You cannot remove Admins.'}
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading users…</p>
      ) : users.length === 0 ? (
        <p className="text-sm text-muted-foreground">No users found.</p>
      ) : (
        <ul className="space-y-4">
          {users.map((u) => {
            const draft = drafts[u.id] || {
              role: u.role,
              modules: u.modules.filter((m) => m !== 'dashboard'),
            };
            const editable = canEditUser(u);
            const removable = canRemoveUser(u);
            const picksModules =
              draft.role !== 'admin' && draft.role !== 'super_admin';
            const isSelf = u.id === currentUserId;
            return (
              <li
                key={u.id}
                className="rounded-md border border-border p-4 space-y-3"
              >
                <div>
                  <p className="font-medium text-foreground">{u.username}</p>
                  <p className="text-xs text-muted-foreground">
                    {u.displayName || 'No display name'}
                    {isSelf ? ' · you' : ''}
                    {' · '}
                    {roleLabel(u.role)}
                    {!editable ? ' · view only' : ''}
                  </p>
                </div>

                {editable ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">
                          Role
                        </label>
                        <select
                          value={draft.role}
                          onChange={(e) =>
                            setDraftRole(u.id, e.target.value as UserRole)
                          }
                          className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        >
                          {isSuper ? (
                            <>
                              <option value="admin">Admin — all modules</option>
                              <option value="staff">
                                Staff — choose modules
                              </option>
                              <option value="super_admin">Super Admin</option>
                            </>
                          ) : (
                            <option value="staff">
                              Staff — choose modules
                            </option>
                          )}
                        </select>
                      </div>

                      <div>
                        <p className="block text-xs font-medium text-muted-foreground mb-1">
                          Modules
                        </p>
                        {picksModules ? (
                          <div className="space-y-1">
                            {FLOW_MODULES.map((opt) => (
                              <label
                                key={opt.id}
                                className="flex items-center gap-2 text-sm text-card-foreground"
                              >
                                <input
                                  type="checkbox"
                                  checked={draft.modules.includes(opt.id)}
                                  onChange={() => toggleModule(u.id, opt.id)}
                                  className="rounded border-input"
                                />
                                {opt.label}
                              </label>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground pt-2">
                            All modules (GP, Retention, Detention)
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={busyId === u.id}
                        onClick={() => onSave(u.id)}
                      >
                        {busyId === u.id ? 'Saving…' : 'Update'}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={busyId === u.id || !removable}
                        onClick={() => onRemove(u)}
                      >
                        Remove
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {u.role === 'admin'
                      ? 'Admins can invite other Admins but cannot remove or edit them.'
                      : 'Only a Super Admin can manage this account.'}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {err ? <p className="text-sm text-destructive">{err}</p> : null}
      {msg ? <p className="text-sm text-green-600">{msg}</p> : null}
    </section>
  );
}
