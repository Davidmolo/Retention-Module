"use client";

import { useCallback, useEffect, useState } from "react";
import type { MessageTemplateId } from "@/lib/retention/messages";

type EditorTemplate = {
  id: MessageTemplateId;
  title: string;
  description: string;
  channel: string;
  editorGuide: string;
  placeholders: { token: string; meaning: string }[];
  defaultBody: string;
  body: string;
  isCustom: boolean;
  updatedAt: string | null;
};

export function ConfigureMessagesPanel({
  focusId,
  onBack,
}: {
  focusId?: MessageTemplateId | null;
  onBack: () => void;
}) {
  const [templates, setTemplates] = useState<EditorTemplate[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/retention/message-templates", {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Failed to load message texts");
      }
      const list = (json.data?.templates || []) as EditorTemplate[];
      setTemplates(list);
      const next: Record<string, string> = {};
      for (const t of list) next[t.id] = t.body;
      setDrafts(next);
    } catch (e) {
      setError((e as Error).message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!focusId || loading) return;
    const el = document.getElementById(`msg-${focusId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focusId, loading]);

  async function save(id: MessageTemplateId) {
    setSavingId(id);
    setSavedId(null);
    setError(null);
    try {
      const res = await fetch("/api/retention/message-templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, body: drafts[id] ?? "" }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Save failed");
      }
      setTemplates((prev) =>
        prev.map((t) =>
          t.id === id
            ? {
                ...t,
                body: json.data.body,
                isCustom: true,
                updatedAt: json.data.updatedAt,
              }
            : t
        )
      );
      setDrafts((d) => ({ ...d, [id]: json.data.body }));
      setSavedId(id);
    } catch (e) {
      setError((e as Error).message || "Save failed");
    } finally {
      setSavingId(null);
    }
  }

  async function reset(id: MessageTemplateId) {
    setSavingId(id);
    setSavedId(null);
    setError(null);
    try {
      const res = await fetch("/api/retention/message-templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, reset: true }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Reset failed");
      }
      setTemplates((prev) =>
        prev.map((t) =>
          t.id === id
            ? {
                ...t,
                body: json.data.body,
                isCustom: false,
                updatedAt: null,
              }
            : t
        )
      );
      setDrafts((d) => ({ ...d, [id]: json.data.body }));
      setSavedId(id);
    } catch (e) {
      setError((e as Error).message || "Reset failed");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="w-full min-w-0 max-w-full space-y-4 overflow-x-hidden">
      <div>
        <button
          type="button"
          onClick={onBack}
          className="mb-2 text-xs font-semibold text-[var(--xxii-blue)] hover:underline"
        >
          ← Back to overview
        </button>
        <h2 className="text-lg font-extrabold tracking-tight text-[var(--xxii-text)] sm:text-xl">
          Configure — message texts
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-[var(--xxii-muted)]">
          Edit the SMS Retention sends to drivers. Changes apply to future sends
          (live and local). Use the placeholder tokens exactly as shown — they
          are replaced when the message is sent.
        </p>
        <div className="mt-3 max-w-3xl rounded-xl border border-sky-200 bg-sky-50/80 px-4 py-3 text-sm text-slate-700">
          <div className="text-xs font-bold uppercase tracking-[0.14em] text-sky-800">
            Editor reference
          </div>
          <p className="mt-1.5 leading-relaxed">
            Write in a clear, personal tone. Prefer one short paragraph. Aim for
            under ~320 characters when you can. Always include{" "}
            <code className="rounded bg-white px-1 text-xs">{"{FirstName}"}</code>{" "}
            for personalization. For any survey message, keep{" "}
            <code className="rounded bg-white px-1 text-xs">{"{surveyUrl}"}</code>{" "}
            in the text — do not paste a real link. Each card below lists the
            placeholders that card supports.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="xxii-card h-40 animate-pulse bg-slate-100" />
      ) : (
        <div className="space-y-3">
          {templates.map((tpl) => {
            const dirty = (drafts[tpl.id] ?? "") !== tpl.body;
            return (
              <section
                key={tpl.id}
                id={`msg-${tpl.id}`}
                className="xxii-card scroll-mt-24 overflow-hidden"
              >
                <div className="border-b border-[var(--xxii-line)] bg-slate-50/80 px-4 py-3 sm:px-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-extrabold text-[var(--xxii-text)]">
                      {tpl.title}
                    </h3>
                    <div className="flex items-center gap-2">
                      {tpl.isCustom && (
                        <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800 ring-1 ring-amber-200">
                          Custom
                        </span>
                      )}
                      <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-700 ring-1 ring-sky-200">
                        {tpl.channel}
                      </span>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-[var(--xxii-muted)]">
                    {tpl.description}
                  </p>
                  <p className="mt-2 text-sm font-medium leading-snug text-slate-700">
                    {tpl.editorGuide}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {tpl.placeholders.map((p) => (
                      <span
                        key={p.token}
                        title={p.meaning}
                        className="rounded-md bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200"
                      >
                        {p.token}
                        <span className="ml-1 font-normal text-slate-400">
                          {p.meaning}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
                <div className="space-y-3 px-4 py-4 sm:px-5">
                  <textarea
                    value={drafts[tpl.id] ?? ""}
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, [tpl.id]: e.target.value }))
                    }
                    rows={5}
                    className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm leading-relaxed text-slate-800 outline-none ring-sky-200 focus:ring-2"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={savingId === tpl.id || !dirty}
                      onClick={() => void save(tpl.id)}
                      className="rounded-lg bg-[var(--xxii-blue)] px-3 py-1.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {savingId === tpl.id ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      disabled={savingId === tpl.id || (!tpl.isCustom && !dirty)}
                      onClick={() => void reset(tpl.id)}
                      className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 ring-1 ring-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Reset to default
                    </button>
                    {savedId === tpl.id && !dirty && (
                      <span className="text-xs font-semibold text-emerald-600">
                        Saved
                      </span>
                    )}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
