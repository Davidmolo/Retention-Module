"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import clsx from "clsx";
import {
  AlertCircle,
  Clock,
  DollarSign,
  ExternalLink,
  Filter,
  Inbox,
  Search,
} from "lucide-react";
import type {
  DetentionKpis,
  DetentionListItem,
  DetentionNote,
  DetentionStatus,
} from "@/lib/detention/types";
import { DETENTION_STATUSES } from "@/lib/detention/types";

function money(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function DetentionStatusPill({ status }: { status: string }) {
  const key = status.toLowerCase();
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        key === "new" && "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
        (key.includes("pending") || key === "submitted") &&
          "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
        key === "approved" && "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200",
        key === "paid" && "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
        key === "denied" && "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
        !["new", "approved", "paid", "denied"].includes(key) &&
          !key.includes("pending") &&
          key !== "submitted" &&
          "bg-slate-100 text-slate-700 ring-1 ring-slate-200"
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}

function KpiCard({
  title,
  value,
  hint,
  active,
  onClick,
  tone = "default",
}: {
  title: string;
  value: string;
  hint?: string;
  active?: boolean;
  onClick?: () => void;
  tone?: "default" | "warn" | "good" | "risk";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "xxii-card w-full p-4 text-left transition",
        onClick && "hover:border-slate-300",
        active && "ring-2 ring-[var(--xxii-brand,#1e4d9c)]"
      )}
    >
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {title}
      </div>
      <div
        className={clsx(
          "mt-1 text-2xl font-bold tabular-nums",
          tone === "warn" && "text-amber-700",
          tone === "good" && "text-emerald-700",
          tone === "risk" && "text-rose-700",
          tone === "default" && "text-slate-900"
        )}
      >
        {value}
      </div>
      {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
    </button>
  );
}

export function DetentionBoard() {
  const [items, setItems] = useState<DetentionListItem[]>([]);
  const [kpis, setKpis] = useState<DetentionKpis | null>(null);
  const [statuses, setStatuses] = useState<string[]>([...DETENTION_STATUSES]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [awaitingOnly, setAwaitingOnly] = useState(false);
  const [followUpOnly, setFollowUpOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sp = new URLSearchParams();
      if (status !== "all") sp.set("status", status);
      if (search.trim()) sp.set("search", search.trim());
      if (awaitingOnly) sp.set("awaitingUs", "1");
      if (followUpOnly) sp.set("followUpDue", "1");
      const res = await fetch(`/api/detention?${sp.toString()}`, {
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Failed to load detentions");
      }
      setItems(json.data.items || []);
      setKpis(json.data.kpis || null);
      if (Array.isArray(json.data.statuses)) setStatuses(json.data.statuses);
    } catch (e) {
      setError((e as Error).message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [status, search, awaitingOnly, followUpOnly]);

  useEffect(() => {
    const t = setTimeout(() => {
      void load();
    }, 200);
    return () => clearTimeout(t);
  }, [load]);

  const selected = useMemo(
    () => items.find((i) => i.id === selectedId) || null,
    [items, selectedId]
  );

  return (
    <div className="w-full min-w-0 space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
            Detention
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track detention claims from OpenRoad — status, amounts, and follow-ups.
          </p>
        </div>
      </div>

      {kpis ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <KpiCard
            title="Open"
            value={String(kpis.open)}
            hint={`${kpis.total} total`}
            active={status === "all" && !awaitingOnly && !followUpOnly}
            onClick={() => {
              setStatus("all");
              setAwaitingOnly(false);
              setFollowUpOnly(false);
            }}
          />
          <KpiCard
            title="Awaiting us"
            value={String(kpis.awaitingUs)}
            hint="Customer replied / we owe action"
            tone="warn"
            active={awaitingOnly}
            onClick={() => {
              setAwaitingOnly((v) => !v);
              setFollowUpOnly(false);
            }}
          />
          <KpiCard
            title="Follow-up due"
            value={String(kpis.followUpDue)}
            hint="Due today or earlier"
            tone="risk"
            active={followUpOnly}
            onClick={() => {
              setFollowUpOnly((v) => !v);
              setAwaitingOnly(false);
            }}
          />
          <KpiCard
            title="Paid"
            value={String(kpis.paid)}
            tone="good"
            active={status === "Paid"}
            onClick={() => {
              setStatus((s) => (s === "Paid" ? "all" : "Paid"));
              setAwaitingOnly(false);
              setFollowUpOnly(false);
            }}
          />
          <KpiCard
            title="Open amount"
            value={money(kpis.openAmount)}
            hint="Not paid / denied"
          />
        </div>
      ) : null}

      <div className="xxii-card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customer, driver, load #, truck…"
              className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-[var(--xxii-brand,#1e4d9c)]"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-slate-400" />
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="all">All statuses</option>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error ? (
          <div className="flex items-center gap-2 p-6 text-sm text-rose-600">
            <AlertCircle size={16} />
            {error}
          </div>
        ) : null}

        {loading && !items.length ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-slate-100" />
            ))}
          </div>
        ) : null}

        {!loading && !error && !items.length ? (
          <div className="flex flex-col items-center gap-2 p-12 text-center text-sm text-slate-500">
            <Inbox size={28} className="text-slate-300" />
            No detentions match these filters.
          </div>
        ) : null}

        {items.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Customer / Load</th>
                  <th className="px-4 py-3 font-medium">Driver</th>
                  <th className="px-4 py-3 font-medium">Stop</th>
                  <th className="px-4 py-3 font-medium">Time</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Flags</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => setSelectedId(row.id)}
                    className={clsx(
                      "cursor-pointer transition hover:bg-slate-50",
                      selectedId === row.id && "bg-sky-50/60"
                    )}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">
                        {row.customer || "—"}
                      </div>
                      <div className="text-xs text-slate-500">
                        Load {row.loadNumber || "—"}
                        {row.shipmentNumber ? ` · Ship ${row.shipmentNumber}` : ""}
                      </div>
                      <div className="text-xs text-slate-400">
                        {row.dispatcher || "No dispatcher"}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div>{row.driverName || "—"}</div>
                      <div className="text-xs text-slate-500">
                        #{row.driverNumber || "—"} · Truck {row.truckNumber || "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3">{row.stopType || "—"}</td>
                    <td className="px-4 py-3 tabular-nums">
                      {row.detentionTimeLabel ||
                        (row.detentionMins != null
                          ? `${row.detentionMins}m`
                          : "—")}
                    </td>
                    <td className="px-4 py-3 font-semibold tabular-nums">
                      {money(row.amount)}
                    </td>
                    <td className="px-4 py-3">
                      <DetentionStatusPill status={row.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {row.awaitingUs &&
                        !["Paid", "Denied"].includes(row.status) ? (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-800">
                            Awaiting us
                          </span>
                        ) : null}
                        {row.followUpDate ? (
                          <span className="inline-flex items-center gap-0.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
                            <Clock size={10} />
                            {row.followUpDate}
                          </span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      {selectedId ? (
        <DetentionDetailDrawer
          id={selectedId}
          fallback={selected}
          statuses={statuses as DetentionStatus[]}
          onClose={() => setSelectedId(null)}
          onChanged={() => void load()}
        />
      ) : null}
    </div>
  );
}

function DetentionDetailDrawer({
  id,
  fallback,
  statuses,
  onClose,
  onChanged,
}: {
  id: string;
  fallback: DetentionListItem | null;
  statuses: DetentionStatus[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detention, setDetention] = useState(fallback);
  const [notes, setNotes] = useState<DetentionNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/detention/${encodeURIComponent(id)}`, {
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to load");
      setDetention(json.data.detention);
      setNotes(json.data.notes || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function patch(body: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/detention/${encodeURIComponent(id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Update failed");
      setDetention(json.data.detention);
      setNotes(json.data.notes || []);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function addNote() {
    if (!noteText.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/detention/${encodeURIComponent(id)}/notes`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: noteText }),
        }
      );
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Note failed");
      setNoteText("");
      await refresh();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const d = detention;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close"
        onClick={onClose}
      />
      <aside className="relative z-10 flex h-full w-full max-w-lg flex-col bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Detention detail
            </div>
            <h2 className="truncate text-lg font-bold text-slate-900">
              {d?.customer || "—"}
            </h2>
            <div className="text-sm text-slate-500">
              Load {d?.loadNumber || "—"}
              {d?.shipmentNumber ? ` · Ship ${d.shipmentNumber}` : ""}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
          >
            Close
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {error ? (
            <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          ) : null}
          {loading && !d ? (
            <div className="h-40 animate-pulse rounded-lg bg-slate-100" />
          ) : null}
          {d ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <DetentionStatusPill status={d.status} />
                <label className="ml-auto flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={d.awaitingUs}
                    disabled={saving}
                    onChange={(e) =>
                      void patch({ awaitingUs: e.target.checked })
                    }
                  />
                  Awaiting us
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <Field label="Status">
                  <select
                    value={d.status}
                    disabled={saving}
                    onChange={(e) => void patch({ status: e.target.value })}
                    className="w-full rounded-lg border border-border px-2 py-1.5"
                  >
                    {statuses.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Follow-up date">
                  <input
                    type="date"
                    value={d.followUpDate || ""}
                    disabled={saving}
                    onChange={(e) =>
                      void patch({
                        followUpDate: e.target.value || null,
                      })
                    }
                    className="w-full rounded-lg border border-border px-2 py-1.5"
                  />
                </Field>
                <Field label="Dispatcher">{d.dispatcher || "—"}</Field>
                <Field label="Stop type">{d.stopType || "—"}</Field>
                <Field label="Driver">
                  {d.driverName || "—"}
                  {d.driverNumber ? ` (#${d.driverNumber})` : ""}
                </Field>
                <Field label="Truck">{d.truckNumber || "—"}</Field>
                <Field label="Detention time">
                  {d.detentionTimeLabel ||
                    (d.detentionMins != null ? `${d.detentionMins} min` : "—")}
                </Field>
                <Field label="Amount">
                  <span className="inline-flex items-center gap-1 font-semibold">
                    <DollarSign size={14} />
                    {money(d.amount)}
                  </span>
                  <span className="ml-1 text-xs text-slate-400">
                    @ {money(d.ratePerHour)}/hr
                  </span>
                </Field>
                <Field label="Arrival">{d.arrivalTime || "—"}</Field>
                <Field label="Detention start">{d.detentionStart || "—"}</Field>
                <Field label="Departure">{d.driverDeparture || "—"}</Field>
                <Field label="Customer email">{d.customerEmail || "—"}</Field>
              </div>

              <div className="space-y-2 text-sm">
                <Field label="Pickup">{d.puLocation || "—"}</Field>
                <Field label="Delivery">{d.delLocation || "—"}</Field>
              </div>

              <div className="flex flex-wrap gap-2">
                {d.loadLink ? (
                  <a
                    href={d.loadLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-slate-50"
                  >
                    Open load <ExternalLink size={14} />
                  </a>
                ) : null}
                {d.threadUrl ? (
                  <a
                    href={d.threadUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-slate-50"
                  >
                    Email thread <ExternalLink size={14} />
                  </a>
                ) : null}
              </div>

              <section>
                <h3 className="mb-2 text-sm font-semibold text-slate-800">
                  Notes
                </h3>
                <div className="flex gap-2">
                  <textarea
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    rows={2}
                    placeholder="Add a note…"
                    className="min-h-[64px] flex-1 rounded-lg border border-border px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    disabled={saving || !noteText.trim()}
                    onClick={() => void addNote()}
                    className="self-end rounded-lg bg-[var(--xxii-brand,#1e4d9c)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
                <ul className="mt-3 space-y-2">
                  {notes.map((n) => (
                    <li
                      key={n.id}
                      className="rounded-lg border border-border bg-slate-50 px-3 py-2 text-sm"
                    >
                      <div className="text-xs text-slate-500">
                        {n.author || "User"} ·{" "}
                        {new Date(n.createdAt).toLocaleString()}
                      </div>
                      <div className="mt-0.5 whitespace-pre-wrap text-slate-800">
                        {n.body}
                      </div>
                    </li>
                  ))}
                  {!notes.length ? (
                    <li className="text-xs text-slate-400">No notes yet.</li>
                  ) : null}
                </ul>
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold text-slate-800">
                  History
                </h3>
                <ul className="space-y-1.5 text-xs text-slate-600">
                  {[...(d.history || [])].reverse().map((h, i) => (
                    <li
                      key={`${h.timestamp}-${i}`}
                      className="rounded border border-border px-2 py-1.5"
                    >
                      <span className="font-medium">{h.user || "system"}</span>
                      {h.field ? (
                        <>
                          {" "}
                          changed <span className="font-medium">{h.field}</span>{" "}
                          {h.from ? `${h.from} → ` : ""}
                          {h.to || ""}
                        </>
                      ) : (
                        <> — {h.text || h.type}</>
                      )}
                      <div className="text-slate-400">
                        {h.timestamp
                          ? new Date(h.timestamp).toLocaleString()
                          : ""}
                      </div>
                    </li>
                  ))}
                  {!d.history?.length ? (
                    <li className="text-slate-400">No history.</li>
                  ) : null}
                </ul>
              </section>
            </>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-0.5 text-slate-900">{children}</div>
    </div>
  );
}
