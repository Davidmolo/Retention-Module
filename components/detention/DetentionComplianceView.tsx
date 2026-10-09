"use client";



import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Search,
  X,
} from "lucide-react";
import type { DetentionComplianceGroup } from "@/lib/detention/types";
import {
  detentionGmailMailboxLabel,
  gmailSearchUrl,
  normalizeGmailThreadUrl,
} from "@/lib/detention/gmailLinks";



function money(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}



function formatWhen(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()} ${String(
    d.getHours()
  ).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}



function ComplianceMark({ value }: { value: string | null | undefined }) {
  if (value === "ok") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200"
        title="Dispatcher replied within 48 hours"
      >
        <Check size={12} /> Replied ≤48h
      </span>
    );
  }
  if (value === "missed") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200"
        title="No dispatcher reply within 48 hours"
      >
        <X size={12} /> No reply ≤48h
      </span>
    );
  }
  if (value === "pending") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200"
        title="Still inside the 48-hour window"
      >
        Waiting (48h window)
      </span>
    );
  }
  if (value === "no_follow_up") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-800 ring-1 ring-orange-200"
        title="Dispatcher replied before, but no further reply in the last 48 hours while claim is still open"
      >
        No follow up ≤48h
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200"
      title="This detention has no dispatcher email saved, so we can't check Gmail for their reply on this thread (the name above may still show an email from other detentions)."
    >
      N/A
    </span>
  );
}



type StatusFilter = "all" | "ok" | "missed" | "pending" | "no_follow_up" | "n/a";



export function DetentionComplianceView() {
  const [groups, setGroups] = useState<DetentionComplianceGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);



  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/detention/compliance", {
          credentials: "include",
        });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          throw new Error(json.error || "Failed to load compliance");
        }
        if (cancelled) return;
        const next = (json.data.groups || []) as DetentionComplianceGroup[];
        setGroups(next);
        if (next.length) {
          setSelectedKey(next[0].dispatcher.toLowerCase());
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);



  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groups.filter((g) => {
      if (q) {
        const hay = `${g.dispatcher} ${g.dispatcherEmail || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (statusFilter === "all") return true;
      if (statusFilter === "ok") return g.ok > 0;
      if (statusFilter === "missed") return g.missed > 0;
      if (statusFilter === "pending") return g.pending > 0;
      if (statusFilter === "no_follow_up") return g.noFollowUp > 0;
      if (statusFilter === "n/a") return g.na > 0;
      return true;
    });
  }, [groups, search, statusFilter]);



  useEffect(() => {
    if (!filtered.length) {
      setSelectedKey(null);
      return;
    }
    if (
      !selectedKey ||
      !filtered.some((g) => g.dispatcher.toLowerCase() === selectedKey)
    ) {
      setSelectedKey(filtered[0].dispatcher.toLowerCase());
    }
  }, [filtered, selectedKey]);



  const selected = filtered.find(
    (g) => g.dispatcher.toLowerCase() === selectedKey
  );



  const visibleItems = useMemo(() => {
    if (!selected) return [];
    if (statusFilter === "all") return selected.items;
    return selected.items.filter((item) => {
      const c = (item.dispatcherCompliance || "n/a").toLowerCase();
      return c === statusFilter;
    });
  }, [selected, statusFilter]);



  const totals = useMemo(() => {
    return groups.reduce(
      (acc, g) => {
        acc.total += g.total;
        acc.ok += g.ok;
        acc.missed += g.missed;
        acc.pending += g.pending;
        acc.noFollowUp += g.noFollowUp || 0;
        acc.na += g.na;
        return acc;
      },
      { total: 0, ok: 0, missed: 0, pending: 0, noFollowUp: 0, na: 0 }
    );
  }, [groups]);



  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
            Dispatcher compliance
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick a dispatcher on the left — full detention details stay on the
            right. Nothing is removed; this just avoids endless scrolling.
          </p>
        </div>
        <Link
          href="/detention"
          className="text-sm font-medium text-[var(--xxii-brand,#1e4d9c)] hover:underline"
        >
          ← Back to board
        </Link>
      </div>



      {!loading && groups.length ? (
        <div className="grid gap-2 sm:grid-cols-5">
          {[
            { label: "Detentions", value: totals.total },
            { label: "Replied ≤48h", value: totals.ok, tone: "good" },
            { label: "Missed", value: totals.missed, tone: "risk" },
            { label: "No follow up ≤48h", value: totals.noFollowUp, tone: "warn" },
            { label: "Pending", value: totals.pending, tone: "warn" },
            { label: "N/A", value: totals.na },
          ].map((c) => (
            <div key={c.label} className="xxii-card px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                {c.label}
              </div>
              <div
                className={clsx(
                  "text-xl font-bold tabular-nums",
                  c.tone === "good" && "text-emerald-700",
                  c.tone === "risk" && "text-rose-700",
                  c.tone === "warn" && "text-amber-700"
                )}
              >
                {c.value}
              </div>
            </div>
          ))}
        </div>
      ) : null}



      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search dispatcher name or email…"
            className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-[var(--xxii-brand,#1e4d9c)]"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["all", "All"],
              ["missed", "Missed"],
              ["no_follow_up", "No follow up ≤48h"],
              ["ok", "Replied"],
              ["pending", "Pending"],
              ["n/a", "N/A"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setStatusFilter(value)}
              className={clsx(
                "rounded-full px-3 py-1.5 text-xs font-semibold transition",
                statusFilter === value
                  ? "bg-[var(--xxii-brand,#1e4d9c)] text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>



      {error ? (
        <div className="flex items-center gap-2 text-sm text-rose-600">
          <AlertCircle size={16} />
          {error}
        </div>
      ) : null}



      {loading ? (
        <div className="grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="h-80 animate-pulse rounded-xl bg-slate-100" />
          <div className="h-80 animate-pulse rounded-xl bg-slate-100" />
        </div>
      ) : null}



      {!loading && !filtered.length ? (
        <div className="xxii-card p-8 text-sm text-muted-foreground">
          No dispatchers match this search/filter.
        </div>
      ) : null}



      {!loading && filtered.length ? (
        <div className="grid gap-3 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start">
          <aside className="xxii-card max-h-[min(70vh,720px)] overflow-y-auto lg:sticky lg:top-4">
            <div className="sticky top-0 z-10 border-b border-border bg-card px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Dispatchers ({filtered.length})
            </div>
            <ul className="divide-y divide-border">
              {filtered.map((g) => {
                const key = g.dispatcher.toLowerCase();
                const active = key === selectedKey;
                return (
                  <li key={g.dispatcher}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedKey(key);
                        setExpanded(true);
                      }}
                      className={clsx(
                        "flex w-full flex-col gap-1 px-3 py-2.5 text-left transition",
                        active
                          ? "bg-sky-50"
                          : "hover:bg-slate-50"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-semibold text-slate-900">
                          {g.dispatcher}
                        </span>
                        <span className="text-[11px] tabular-nums text-slate-500">
                          {g.total}
                        </span>
                      </div>
                      <div className="truncate text-[11px] text-slate-500">
                        {g.dispatcherEmail || "No email on file"}
                      </div>
                      <div className="flex flex-wrap gap-1 text-[10px] font-semibold">
                        <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">
                          ✓ {g.ok}
                        </span>
                        <span className="rounded bg-rose-50 px-1.5 py-0.5 text-rose-700">
                          ✗ {g.missed}
                        </span>
                        <span className="rounded bg-orange-50 px-1.5 py-0.5 text-orange-800">
                          NF {g.noFollowUp || 0}
                        </span>
                        <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-800">
                          {g.pending}
                        </span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">
                          N/A {g.na}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>



          <section className="xxii-card min-w-0 overflow-hidden">
            {selected ? (
              <>
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  className="flex w-full items-start justify-between gap-3 border-b border-border px-4 py-3 text-left"
                >
                  <div>
                    <h2 className="text-base font-semibold text-foreground">
                      {selected.dispatcher}
                    </h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {selected.dispatcherEmail || "No email on file"} ·{" "}
                      {visibleItems.length} detention
                      {visibleItems.length === 1 ? "" : "s"} shown
                      {statusFilter !== "all"
                        ? ` (filtered: ${statusFilter})`
                        : ""}{" "}
                      · totals ✓{selected.ok} ✗{selected.missed} no follow up
                      ≤48h {selected.noFollowUp || 0} pending{" "}
                      {selected.pending} N/A {selected.na}
                    </p>
                  </div>
                  {expanded ? (
                    <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-slate-400" />
                  ) : (
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-400" />
                  )}
                </button>



                {expanded ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[860px] text-left text-sm">
                      <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-4 py-3 font-medium">Email date</th>
                          <th className="px-4 py-3 font-medium">
                            Customer / Load
                          </th>
                          <th className="px-4 py-3 font-medium">Driver</th>
                          <th className="px-4 py-3 font-medium">Amount</th>
                          <th className="px-4 py-3 font-medium">Compliance</th>
                          <th className="px-4 py-3 font-medium">Reply at</th>
                          <th className="px-4 py-3 font-medium">Thread</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {visibleItems.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-50/80">
                            <td className="px-4 py-3 tabular-nums text-slate-700">
                              {formatWhen(item.emailDate)}
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-medium text-slate-900">
                                {item.customer || "—"}
                              </div>
                              <div className="text-xs text-slate-500">
                                Load {item.loadNumber || "—"}
                                {item.shipmentNumber
                                  ? ` · Ship ${item.shipmentNumber}`
                                  : ""}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              {item.driverName || "—"}
                            </td>
                            <td className="px-4 py-3 tabular-nums">
                              {money(item.amount)}
                            </td>
                            <td className="px-4 py-3">
                              <ComplianceMark
                                value={item.dispatcherCompliance}
                              />
                            </td>
                            <td className="px-4 py-3 tabular-nums text-slate-600">
                              {formatWhen(item.dispatcherRepliedAt)}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-col gap-1">
                                {normalizeGmailThreadUrl(item.threadUrl) ? (
                                  <a
                                    href={normalizeGmailThreadUrl(item.threadUrl)!}
                                    target="_blank"
                                    rel="noreferrer"
                                    title={`Opens in ${detentionGmailMailboxLabel()} — that mailbox must be signed in`}
                                    className="inline-flex items-center gap-1 text-xs font-medium text-[var(--xxii-brand,#1e4d9c)] hover:underline"
                                  >
                                    Thread <ExternalLink size={12} />
                                  </a>
                                ) : null}
                                {gmailSearchUrl({
                                  loadNumber: item.loadNumber,
                                  shipmentNumber: item.shipmentNumber,
                                }) ? (
                                  <a
                                    href={gmailSearchUrl({
                                      loadNumber: item.loadNumber,
                                      shipmentNumber: item.shipmentNumber,
                                    })!}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:underline"
                                  >
                                    Search <ExternalLink size={12} />
                                  </a>
                                ) : null}
                                {!normalizeGmailThreadUrl(item.threadUrl) &&
                                !gmailSearchUrl({
                                  loadNumber: item.loadNumber,
                                  shipmentNumber: item.shipmentNumber,
                                })
                                  ? "—"
                                  : null}
                              </div>
                            </td>
                          </tr>
                        ))}
                        {!visibleItems.length ? (
                          <tr>
                            <td
                              colSpan={7}
                              className="px-4 py-8 text-center text-sm text-slate-500"
                            >
                              No detentions for this filter.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="px-4 py-6 text-sm text-muted-foreground">
                    Section collapsed — click the header to show full detention
                    details again.
                  </div>
                )}
              </>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}


