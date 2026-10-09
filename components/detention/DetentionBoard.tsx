"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import clsx from "clsx";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  Filter,
  Inbox,
  MapPin,
  RefreshCw,
  Search,
} from "lucide-react";
import type {
  DetentionAnalytics,
  DetentionKpis,
  DetentionListItem,
  DetentionNote,
  DetentionStatus,
} from "@/lib/detention/types";
import { DETENTION_STATUSES } from "@/lib/detention/types";
import {
  gmailSearchUrl,
  normalizeGmailThreadUrl,
} from "@/lib/detention/gmailLinks";
import {
  DetentionViewTabs,
  InsightsPanel,
  PipelineBoard,
  ProgressiveStrip,
  buildEmailClipboard,
  mapsRouteUrl,
  type BoardView,
} from "@/components/detention/DetentionOpsViews";

function money(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

/** Display email/created day as M/D/YYYY. */
function formatEmailDay(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return "—";
    return `${Number(m[2])}/${Number(m[3])}/${m[1]}`;
  }
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

function formatDuration(totalMins: number): string {
  const m = Math.max(0, Math.round(totalMins));
  const h = Math.floor(m / 60);
  const mins = m % 60;
  return `${h}h ${String(mins).padStart(2, "0")}m`;
}

type DetentionSort = "default" | "emailDateDesc" | "emailDateAsc";

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

function FilterControl({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={clsx("flex min-w-0 flex-col gap-1", className)}>
      <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500 whitespace-nowrap">
        {label}
      </span>
      {children}
    </label>
  );
}

const filterControlClass =
  "h-9 w-full rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--xxii-brand,#1e4d9c)]";

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
        "xxii-card w-full p-3.5 text-left transition sm:p-4",
        onClick && "hover:border-slate-300",
        active && "ring-2 ring-[var(--xxii-brand,#1e4d9c)]"
      )}
    >
      <div className="truncate text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {title}
      </div>
      <div
        className={clsx(
          "mt-1 truncate text-xl font-bold tabular-nums sm:text-2xl",
          tone === "warn" && "text-amber-700",
          tone === "good" && "text-emerald-700",
          tone === "risk" && "text-rose-700",
          tone === "default" && "text-slate-900"
        )}
      >
        {value}
      </div>
      {hint ? (
        <div className="mt-1 truncate text-xs text-slate-500" title={hint}>
          {hint}
        </div>
      ) : null}
    </button>
  );
}

type KpiFilter = "open" | "awaiting" | "followUp" | "paid" | null;

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

export function DetentionBoard() {
  const [items, setItems] = useState<DetentionListItem[]>([]);
  const [kpis, setKpis] = useState<DetentionKpis | null>(null);
  const [statuses, setStatuses] = useState<string[]>([...DETENTION_STATUSES]);
  const [dispatchers, setDispatchers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [dispatcher, setDispatcher] = useState("all");
  const [emailDate, setEmailDate] = useState("");
  const [sort, setSort] = useState<DetentionSort>("emailDateDesc");
  const [awaitingOnly, setAwaitingOnly] = useState(false);
  const [followUpOnly, setFollowUpOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [view, setView] = useState<BoardView>("table");
  const [days, setDays] = useState(90);
  const [analytics, setAnalytics] = useState<DetentionAnalytics | null>(null);
  const [pipelineItems, setPipelineItems] = useState<DetentionListItem[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const applyKpiFilter = useCallback((next: KpiFilter) => {
    // KPI sections are exclusive — switching always clears the others.
    setPage(1);
    if (next === "open" || next === null) {
      setStatus("all");
      setAwaitingOnly(false);
      setFollowUpOnly(false);
      return;
    }
    if (next === "awaiting") {
      setStatus("all");
      setAwaitingOnly(true);
      setFollowUpOnly(false);
      return;
    }
    if (next === "followUp") {
      setStatus("all");
      setAwaitingOnly(false);
      setFollowUpOnly(true);
      return;
    }
    // paid
    setStatus("Paid");
    setAwaitingOnly(false);
    setFollowUpOnly(false);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sp = new URLSearchParams();
      if (status !== "all") sp.set("status", status);
      if (dispatcher !== "all") sp.set("dispatcher", dispatcher);
      if (emailDate) sp.set("emailDate", emailDate);
      if (sort !== "default") sp.set("sort", sort);
      if (search.trim()) sp.set("search", search.trim());
      if (awaitingOnly) sp.set("awaitingUs", "1");
      if (followUpOnly) sp.set("followUpDue", "1");
      if (days > 0) sp.set("days", String(days));
      const useWide =
        view === "pipeline" || view === "progressive" || view === "insights";
      sp.set("page", useWide ? "1" : String(page));
      sp.set("pageSize", useWide ? "200" : String(pageSize));
      const [listRes, analyticsRes] = await Promise.all([
        fetch(`/api/detention?${sp.toString()}`, { credentials: "include" }),
        fetch(`/api/detention/analytics?days=${days}`, {
          credentials: "include",
        }),
      ]);
      const json = await listRes.json();
      if (!listRes.ok || !json.ok) {
        throw new Error(json.error || "Failed to load detentions");
      }
      const listItems = json.data.items || [];
      setItems(listItems);
      if (useWide) setPipelineItems(listItems);
      setTotal(Number(json.data.total || 0));
      setTotalPages(Math.max(1, Number(json.data.totalPages || 1)));
      setKpis(json.data.kpis || null);
      if (Array.isArray(json.data.statuses)) setStatuses(json.data.statuses);
      if (Array.isArray(json.data.dispatchers)) {
        setDispatchers(json.data.dispatchers);
      }
      const ajson = await analyticsRes.json().catch(() => null);
      if (analyticsRes.ok && ajson?.ok) {
        setAnalytics(ajson.data);
      } else {
        setAnalytics(null);
      }
    } catch (e) {
      setError((e as Error).message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [
    status,
    dispatcher,
    emailDate,
    sort,
    search,
    awaitingOnly,
    followUpOnly,
    page,
    pageSize,
    days,
    view,
  ]);

  // Reset to page 1 when filters change (not when page itself changes)
  useEffect(() => {
    setPage(1);
  }, [
    status,
    dispatcher,
    emailDate,
    sort,
    search,
    awaitingOnly,
    followUpOnly,
    pageSize,
    days,
  ]);

  useEffect(() => {
    const t = setTimeout(() => {
      void load();
    }, 200);
    return () => clearTimeout(t);
  }, [load]);

  const syncInbox = useCallback(async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch("/api/detention/intake", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Sync failed");
      const d = json.data || {};
      setSyncMsg(
        `Synced: ${d.created || 0} new, ${d.updated || 0} updated, ${d.skipped || 0} skipped`
      );
      await load();
    } catch (e) {
      setSyncMsg((e as Error).message || "Sync failed");
    } finally {
      setSyncing(false);
    }
  }, [load]);

  const startClaim = useCallback(
    async (id: string) => {
      try {
        await fetch(`/api/detention/${encodeURIComponent(id)}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "Pending POD" }),
        });
        await load();
        setSelectedId(id);
      } catch {
        /* ignore */
      }
    },
    [load]
  );

  const selected = useMemo(
    () =>
      items.find((i) => i.id === selectedId) ||
      pipelineItems.find((i) => i.id === selectedId) ||
      null,
    [items, pipelineItems, selectedId]
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
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
          <KpiCard
            title="Open"
            value={String(kpis.open)}
            hint={`${kpis.total} total`}
            active={
              status === "all" && !awaitingOnly && !followUpOnly
            }
            onClick={() => applyKpiFilter("open")}
          />
          <KpiCard
            title="Awaiting us"
            value={String(kpis.awaitingUs)}
            hint="Customer replied / awaiting our reply"
            tone="warn"
            active={awaitingOnly && !followUpOnly && status === "all"}
            onClick={() =>
              applyKpiFilter(
                awaitingOnly && !followUpOnly && status === "all"
                  ? "open"
                  : "awaiting"
              )
            }
          />
          <KpiCard
            title="Follow-up due"
            value={String(kpis.followUpDue)}
            hint="Due today or earlier"
            tone="risk"
            active={followUpOnly && !awaitingOnly && status === "all"}
            onClick={() =>
              applyKpiFilter(
                followUpOnly && !awaitingOnly && status === "all"
                  ? "open"
                  : "followUp"
              )
            }
          />
          <KpiCard
            title="Paid"
            value={String(kpis.paid)}
            hint={`Collected ${money(kpis.paidAmount ?? 0)}`}
            tone="good"
            active={status === "Paid" && !awaitingOnly && !followUpOnly}
            onClick={() =>
              applyKpiFilter(
                status === "Paid" && !awaitingOnly && !followUpOnly
                  ? "open"
                  : "paid"
              )
            }
          />
          <KpiCard
            title="Open amount"
            value={money(kpis.openAmount)}
            hint="Not paid / denied"
          />
        </div>
      ) : null}

      <DetentionViewTabs view={view} onChange={setView} />

      {error && view !== "table" && view !== "progressive" ? (
        <div className="flex items-center gap-2 text-sm text-rose-600">
          <AlertCircle size={16} />
          {error}
        </div>
      ) : null}

      {/* Shared filter bar — same controls for every view */}
      <div className="xxii-card overflow-hidden">
        <div className="space-y-3 border-b border-border p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <Filter size={14} className="text-slate-400" />
            Filters
          </div>
          <div className="relative min-w-0">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search load, driver, customer, truck…"
              className="h-10 w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-[var(--xxii-brand,#1e4d9c)]"
            />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            <FilterControl label="Window">
              <select
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className={filterControlClass}
                title="Date window"
              >
                <option value={90}>Last 90 days</option>
                <option value={30}>Last 30 days</option>
                <option value={180}>Last 180 days</option>
                <option value={365}>Last 12 months</option>
                <option value={0}>All time</option>
              </select>
            </FilterControl>
            <FilterControl label="Status">
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setAwaitingOnly(false);
                  setFollowUpOnly(false);
                }}
                className={filterControlClass}
              >
                <option value="all">All statuses</option>
                {statuses.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </FilterControl>
            <FilterControl label="Dispatcher">
              <select
                value={dispatcher}
                onChange={(e) => setDispatcher(e.target.value)}
                className={filterControlClass}
              >
                <option value="all">All dispatchers</option>
                {dispatchers.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </FilterControl>
            <FilterControl label="Email date">
              <div className="flex h-9 items-center gap-1.5">
                <input
                  type="date"
                  value={emailDate}
                  onChange={(e) => {
                    setEmailDate(e.target.value);
                    if (e.target.value && sort === "default") {
                      setSort("emailDateDesc");
                    }
                  }}
                  className={clsx(filterControlClass, "min-w-0 flex-1")}
                  title="Show detentions received on this date"
                />
                {emailDate ? (
                  <button
                    type="button"
                    onClick={() => setEmailDate("")}
                    className="shrink-0 text-xs text-slate-500 underline hover:text-slate-800"
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            </FilterControl>
            <FilterControl label="Sort">
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as DetentionSort)}
                className={filterControlClass}
                title="Sort list"
              >
                <option value="emailDateDesc">Newest first</option>
                <option value="emailDateAsc">Oldest first</option>
                <option value="default">Open first, then newest</option>
              </select>
            </FilterControl>
            <FilterControl label="Actions">
              <div className="flex h-9 items-center gap-2">
                <label className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-slate-600 whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={awaitingOnly}
                    onChange={(e) => {
                      setAwaitingOnly(e.target.checked);
                      if (e.target.checked) setFollowUpOnly(false);
                      setPage(1);
                    }}
                  />
                  Needs reply
                </label>
                <button
                  type="button"
                  disabled={syncing}
                  onClick={() => void syncInbox()}
                  className="inline-flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-slate-700 whitespace-nowrap hover:bg-slate-50 disabled:opacity-50"
                >
                  <RefreshCw
                    size={14}
                    className={syncing ? "animate-spin" : ""}
                  />
                  Sync
                </button>
              </div>
            </FilterControl>
          </div>
        </div>
        {syncMsg ? (
          <div className="border-b border-border px-4 py-2 text-xs text-slate-600">
            {syncMsg}
          </div>
        ) : null}
      </div>

      {view === "progressive" ? (
        <ProgressiveStrip analytics={analytics} />
      ) : null}

      {view === "pipeline" ? (
        <PipelineBoard
          items={pipelineItems}
          analytics={analytics}
          onOpen={setSelectedId}
          onStartClaim={(id) => void startClaim(id)}
        />
      ) : null}

      {view === "insights" ? <InsightsPanel analytics={analytics} /> : null}

      {view === "table" || view === "progressive" ? (
      <div className="xxii-card overflow-hidden">

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
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] table-fixed text-left text-sm">
                <colgroup>
                  <col className="w-[14%]" />
                  <col className="w-[10%]" />
                  <col className="w-[9%]" />
                  <col className="w-[10%]" />
                  <col className="w-[11%]" />
                  <col className="w-[8%]" />
                  <col className="w-[11%]" />
                  <col className="w-[8%]" />
                  <col className="w-[6%]" />
                  <col className="w-[7%]" />
                  <col className="w-[8%]" />
                  <col className="w-[8%]" />
                </colgroup>
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-3 font-medium whitespace-nowrap">Customer</th>
                    <th className="px-3 py-3 font-medium whitespace-nowrap">Dispatcher</th>
                    <th className="px-3 py-3 font-medium whitespace-nowrap">Load #</th>
                    <th className="px-3 py-3 font-medium whitespace-nowrap">Driver</th>
                    <th className="px-3 py-3 font-medium whitespace-nowrap">PU</th>
                    <th className="px-3 py-3 font-medium whitespace-nowrap">PU Appt</th>
                    <th className="px-3 py-3 font-medium whitespace-nowrap">DEL</th>
                    <th className="px-3 py-3 font-medium whitespace-nowrap">Email date</th>
                    <th className="px-3 py-3 font-medium whitespace-nowrap">Time</th>
                    <th className="px-3 py-3 font-medium whitespace-nowrap">Amount</th>
                    <th className="px-3 py-3 font-medium whitespace-nowrap">Status</th>
                    <th className="px-3 py-3 font-medium whitespace-nowrap">Flags</th>
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
                      <td className="px-3 py-3">
                        <div className="truncate font-medium text-slate-900" title={row.customer || undefined}>
                          {row.customer || "—"}
                        </div>
                        <div className="truncate text-xs text-slate-500" title={row.customerEmail || undefined}>
                          {row.customerEmail || ""}
                        </div>
                      </td>
                      <td className="truncate px-3 py-3 text-sm" title={row.dispatcher || undefined}>
                        {row.dispatcher || "—"}
                      </td>
                      <td className="px-3 py-3">
                        <div className="truncate font-medium">{row.loadNumber || "—"}</div>
                        <div className="truncate text-xs text-slate-500">
                          {row.shipmentNumber || ""}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="truncate">{row.driverName || "—"}</div>
                        <div className="truncate text-xs text-slate-500">
                          Truck #{row.truckNumber || "—"}
                        </div>
                      </td>
                      <td className="truncate px-3 py-3 text-xs text-slate-700" title={row.puLocation || undefined}>
                        {row.puLocation || "—"}
                      </td>
                      <td className="truncate px-3 py-3 text-xs tabular-nums text-slate-600">
                        {row.puAppt || "—"}
                      </td>
                      <td className="truncate px-3 py-3 text-xs text-slate-700" title={row.delLocation || undefined}>
                        {row.delLocation || "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 tabular-nums text-slate-700">
                        {formatEmailDay(row.emailDate || row.createdAt)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 tabular-nums">
                        {row.detentionTimeLabel ||
                          (row.detentionMins != null
                            ? `${row.detentionMins}m`
                            : "—")}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 font-semibold tabular-nums">
                        {money(row.amount)}
                      </td>
                      <td className="px-3 py-3">
                        <DetentionStatusPill status={row.status} />
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-col gap-1">
                          {row.awaitingUs &&
                          !["Paid", "Denied"].includes(row.status) ? (
                            <span className="w-fit rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-800 whitespace-nowrap">
                              Awaiting us
                            </span>
                          ) : null}
                          {row.followUpDate ? (
                            <span className="inline-flex w-fit items-center gap-0.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-600 whitespace-nowrap">
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
            <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-slate-500">
                {total === 0
                  ? "No results"
                  : `Showing ${(page - 1) * pageSize + 1}–${Math.min(
                      page * pageSize,
                      total
                    )} of ${total}`}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-slate-600">
                  Rows
                  <select
                    value={pageSize}
                    onChange={(e) =>
                      setPageSize(
                        Number(e.target.value) as (typeof PAGE_SIZE_OPTIONS)[number]
                      )
                    }
                    className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                  >
                    {PAGE_SIZE_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-40"
                >
                  <ChevronLeft size={14} /> Prev
                </button>
                <span className="text-xs tabular-nums text-slate-600">
                  Page {page} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-40"
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </>
        ) : null}
      </div>
      ) : null}

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
                <Field label="Follow up on">
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
                <Field label="Billable detention">
                  {d.detentionTimeLabel ||
                    (d.detentionMins != null
                      ? formatDuration(d.detentionMins)
                      : "—")}
                </Field>
                <Field label="Driver departed">{d.driverDeparture || "—"}</Field>
                <Field label="Rate per hour">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={d.ratePerHour}
                    disabled={saving}
                    onChange={(e) => {
                      const rate = Number(e.target.value);
                      if (!Number.isFinite(rate)) return;
                      const mins = d.detentionMins;
                      const nextAmount =
                        mins != null && mins > 0
                          ? Math.round((mins / 60) * rate * 100) / 100
                          : d.amount;
                      void patch({
                        ratePerHour: rate,
                        amount: nextAmount,
                        billableAmount: nextAmount,
                      });
                    }}
                    className="w-full rounded-lg border border-border px-2 py-1.5"
                  />
                  <span className="text-[10px] text-slate-400">
                    Changing this recalculates amount below
                  </span>
                </Field>
                <Field label="Amount billed">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={d.amount ?? ""}
                    disabled={saving}
                    onChange={(e) => {
                      const v =
                        e.target.value === "" ? null : Number(e.target.value);
                      void patch({
                        amount: v,
                        billableAmount: v,
                      });
                    }}
                    className="w-full rounded-lg border border-border px-2 py-1.5 font-semibold"
                  />
                </Field>
                <Field label="Amount received">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="not paid yet"
                    value={d.settledAmount ?? ""}
                    disabled={saving}
                    onChange={(e) => {
                      const v =
                        e.target.value === "" ? null : Number(e.target.value);
                      void patch({ settledAmount: v });
                    }}
                    className="w-full rounded-lg border border-border px-2 py-1.5"
                  />
                  <span className="text-[10px] text-slate-400">
                    Leave blank until it lands
                  </span>
                </Field>
                <Field label="Shipment #">{d.shipmentNumber || "—"}</Field>
                <Field label="Bill to / email">{d.customerEmail || "—"}</Field>
                <Field label="Last reply from">{d.lastReplyFrom || "—"}</Field>
                <Field label="Arrival">{d.arrivalTime || "—"}</Field>
                <Field label="Detention start">{d.detentionStart || "—"}</Field>
              </div>

              <div className="space-y-2 text-sm">
                <Field label="Pickup">{d.puLocation || "—"}</Field>
                <Field label="PU appt">{d.puAppt || "—"}</Field>
                <Field label="Delivery">{d.delLocation || "—"}</Field>
                <Field label="DEL appt">{d.delAppt || "—"}</Field>
                {mapsRouteUrl(d.puLocation, d.delLocation) ? (
                  <a
                    href={mapsRouteUrl(d.puLocation, d.delLocation)!}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sm font-medium text-[var(--xxii-brand,#1e4d9c)] hover:underline"
                  >
                    <MapPin size={14} /> Open route on Google Maps
                  </a>
                ) : null}
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(
                        buildEmailClipboard(d)
                      );
                    }}
                    className="inline-flex items-center gap-1 rounded-lg bg-[var(--xxii-brand,#1e4d9c)] px-3 py-1.5 text-sm font-medium text-white"
                  >
                    <Copy size={14} /> Copy for email
                  </button>
                  {normalizeGmailThreadUrl(d.threadUrl) ? (
                    <a
                      href={normalizeGmailThreadUrl(d.threadUrl)!}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-slate-50"
                    >
                      Open email thread <ExternalLink size={14} />
                    </a>
                  ) : null}
                  {d.loadLink ? (
                    <a
                      href={d.loadLink}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-slate-50"
                    >
                      Open in TMS <ExternalLink size={14} />
                    </a>
                  ) : null}
                  <button
                    type="button"
                    disabled={saving || !d.awaitingUs}
                    onClick={() => void patch({ awaitingUs: false })}
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-40"
                  >
                    Mark replied
                  </button>
                  {gmailSearchUrl({
                    loadNumber: d.loadNumber,
                    shipmentNumber: d.shipmentNumber,
                  }) ? (
                    <a
                      href={gmailSearchUrl({
                        loadNumber: d.loadNumber,
                        shipmentNumber: d.shipmentNumber,
                      })!}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-slate-50"
                    >
                      Search Gmail <ExternalLink size={14} />
                    </a>
                  ) : null}
                </div>
                {(d.threadUrl || d.loadNumber) && (
                  <p className="text-xs text-slate-500">
                    Threads live in{" "}
                    <span className="font-medium">ar@goxxii.com</span>. Sign
                    into that mailbox for Direct thread links.
                  </p>
                )}
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
                    placeholder="Add a note for the team…"
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
