'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ChevronDown } from 'lucide-react';
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
  { id: 'driver-comms', label: 'Driver Comms' },
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

function Collapse({
  open,
  children,
}: {
  open: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;
    if (reduce) {
      el.style.height = open ? 'auto' : '0px';
      return;
    }

    if (open) {
      const from = el.getBoundingClientRect().height;
      el.style.height = `${from}px`;
      const target = el.scrollHeight;
      const frame = requestAnimationFrame(() => {
        el.style.height = `${target}px`;
      });
      const onEnd = (event: TransitionEvent) => {
        if (event.propertyName !== 'height') return;
        el.style.height = 'auto';
        el.removeEventListener('transitionend', onEnd);
      };
      el.addEventListener('transitionend', onEnd);
      return () => {
        cancelAnimationFrame(frame);
        el.removeEventListener('transitionend', onEnd);
      };
    }

    el.style.height = `${el.scrollHeight}px`;
    el.getBoundingClientRect();
    const frame = requestAnimationFrame(() => {
      el.style.height = '0px';
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  return (
    <div
      ref={ref}
      className="h-0 overflow-hidden transition-[height] duration-300 ease-out"
      inert={open ? undefined : true}
    >
      {children}
    </div>
  );
}

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
  const [passwordDrafts, setPasswordDrafts] = useState<Record<number, string>>(
    {}
  );
  const [passwordOpen, setPasswordOpen] = useState<Record<number, boolean>>(
    {}
  );

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
            ? ([
                'gross-profit',
                'retention',
                'detention',
                'driver-comms',
              ] as AppModule[])
            : prev[id]?.modules?.length
              ? prev[id].modules
              : (['retention', 'driver-comms'] as AppModule[]),
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

  const onSetPassword = async (u: ManagedUser) => {
    const password = passwordDrafts[u.id] || '';
    if (password.length < 8) {
      setErr('Password must be at least 8 characters');
      setMsg('');
      return;
    }
    if (
      !window.confirm(
        `Set a new password for ${u.username}? Their old password will stop working.`
      )
    ) {
      return;
    }
    setBusyId(u.id);
    setMsg('');
    setErr('');
    try {
      const res = await fetch(`/api/settings/users/${u.id}/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setErr(json?.error || 'Could not set password');
        return;
      }
      setPasswordDrafts((prev) => ({ ...prev, [u.id]: '' }));
      setPasswordOpen((prev) => ({ ...prev, [u.id]: false }));
      setMsg(`Password updated for ${u.username}`);
    } catch {
      setErr('Could not set password');
    } finally {
      setBusyId(null);
    }
  };

  const onRemove = async (u: ManagedUser) => {
    if (!canRemoveUser(u)) {
      setErr(
        u.id === currentUserId
          ? 'You cannot remove your own account'
          : u.role === 'admin'
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
            ? 'Super Admin: update or remove Admins and Staff, and set a new password when someone forgets theirs. Use Invite to add users.'
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

                    {isSuper && !isSelf ? (
                      <div className="w-full overflow-hidden rounded-xl border border-border bg-background shadow-sm">
                        <button
                          type="button"
                          aria-expanded={!!passwordOpen[u.id]}
                          className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => {
                            const next = !passwordOpen[u.id];
                            setPasswordOpen((prev) => ({
                              ...prev,
                              [u.id]: next,
                            }));
                            if (!next) {
                              setPasswordDrafts((prev) => ({
                                ...prev,
                                [u.id]: '',
                              }));
                            }
                          }}
                        >
                          <span className="text-sm font-medium tracking-tight text-foreground">
                            Set new password for{' '}
                            {u.displayName?.trim() || u.username}
                          </span>
                          <span
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors duration-300 ease-out ${
                              passwordOpen[u.id]
                                ? 'bg-foreground text-background'
                                : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            <ChevronDown
                              className={`h-4 w-4 transition-transform duration-300 ease-out ${
                                passwordOpen[u.id] ? 'rotate-180' : ''
                              }`}
                            />
                          </span>
                        </button>
                        <Collapse open={!!passwordOpen[u.id]}>
                          <div className="flex flex-wrap items-end gap-2 border-t border-border bg-muted/30 px-4 py-4">
                            <div className="min-w-[220px] flex-1">
                              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                                New password
                              </label>
                              <input
                                type="password"
                                autoComplete="new-password"
                                value={passwordDrafts[u.id] || ''}
                                onChange={(e) =>
                                  setPasswordDrafts((prev) => ({
                                    ...prev,
                                    [u.id]: e.target.value,
                                  }))
                                }
                                placeholder="At least 8 characters"
                                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                              />
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              disabled={busyId === u.id}
                              onClick={() => onSetPassword(u)}
                            >
                              Save password
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={busyId === u.id}
                              onClick={() => {
                                setPasswordOpen((prev) => ({
                                  ...prev,
                                  [u.id]: false,
                                }));
                                setPasswordDrafts((prev) => ({
                                  ...prev,
                                  [u.id]: '',
                                }));
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </Collapse>
                      </div>
                    ) : null}

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
