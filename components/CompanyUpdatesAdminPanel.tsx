'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { formatUpdateDate } from '@/lib/companyUpdates';

type UpdateRow = {
  id: number;
  title: string;
  summary: string;
  tag: string | null;
  publishedOn: string;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function CompanyUpdatesAdminPanel() {
  const [updates, setUpdates] = useState<UpdateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [tag, setTag] = useState('');
  const [publishedOn, setPublishedOn] = useState(todayIso);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/company-updates', {
        cache: 'no-store',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setErr(json?.error || 'Could not load updates');
        return;
      }
      setUpdates(json.updates || []);
      setErr('');
    } catch {
      setErr('Could not load updates');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    setEditingId(null);
    setTitle('');
    setSummary('');
    setTag('');
    setPublishedOn(todayIso());
  };

  const startEdit = (u: UpdateRow) => {
    setEditingId(u.id);
    setTitle(u.title);
    setSummary(u.summary);
    setTag(u.tag || '');
    setPublishedOn(u.publishedOn);
    setMsg('');
    setErr('');
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg('');
    setErr('');
    try {
      const payload = { title, summary, tag, publishedOn };
      const res = await fetch(
        editingId
          ? `/api/settings/company-updates/${editingId}`
          : '/api/settings/company-updates',
        {
          method: editingId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setErr(json?.error || 'Could not save update');
        return;
      }
      setMsg(editingId ? 'Update saved.' : 'Update published.');
      resetForm();
      await load();
    } catch {
      setErr('Could not save update');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (u: UpdateRow) => {
    if (!window.confirm(`Delete “${u.title}”?`)) return;
    setErr('');
    setMsg('');
    try {
      const res = await fetch(`/api/settings/company-updates/${u.id}`, {
        method: 'DELETE',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setErr(json?.error || 'Could not delete');
        return;
      }
      if (editingId === u.id) resetForm();
      setMsg('Update deleted.');
      await load();
    } catch {
      setErr('Could not delete');
    }
  };

  return (
    <section className="rounded-lg border border-border bg-card p-6 space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-card-foreground">
          Company Updates
        </h2>
        <p className="text-sm text-muted-foreground">
          Publish, edit, or delete Dashboard “What&apos;s new” posts. Visible to
          every signed-in user.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-card-foreground mb-1">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-card-foreground mb-1">
              Tag (optional)
            </label>
            <input
              type="text"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder="Retention, Platform…"
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-card-foreground mb-1">
              Date
            </label>
            <input
              type="date"
              value={publishedOn}
              onChange={(e) => setPublishedOn(e.target.value)}
              required
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-card-foreground mb-1">
              Summary
            </label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              required
              rows={3}
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={saving}>
            {saving
              ? 'Saving…'
              : editingId
                ? 'Save changes'
                : 'Publish update'}
          </Button>
          {editingId ? (
            <Button type="button" variant="outline" onClick={resetForm}>
              Cancel edit
            </Button>
          ) : null}
        </div>
      </form>

      {err ? <p className="text-sm text-destructive">{err}</p> : null}
      {msg ? <p className="text-sm text-green-600">{msg}</p> : null}

      <div className="border-t border-border pt-4">
        <h3 className="text-sm font-semibold text-card-foreground mb-2">
          Published updates
        </h3>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : updates.length === 0 ? (
          <p className="text-sm text-muted-foreground">No updates yet.</p>
        ) : (
          <ul className="space-y-3">
            {updates.map((u) => (
              <li
                key={u.id}
                className="rounded-md border border-border px-3 py-3 space-y-1"
              >
                <div className="flex flex-wrap items-center gap-2">
                  {u.tag ? (
                    <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded bg-muted text-muted-foreground">
                      {u.tag}
                    </span>
                  ) : null}
                  <span className="text-xs text-muted-foreground">
                    {formatUpdateDate(u.publishedOn)}
                  </span>
                </div>
                <p className="font-medium text-foreground">{u.title}</p>
                <p className="text-sm text-muted-foreground">{u.summary}</p>
                <div className="flex gap-2 pt-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => startEdit(u)}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => onDelete(u)}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
