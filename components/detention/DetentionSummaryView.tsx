"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Filter,
  Search,
} from "lucide-react";
import clsx from "clsx";
import {
  DETENTION_STATUSES,
  type DetentionDispatcherSummary,
  type DetentionPartyRow,
  type DetentionPeriodSummary,
} from "@/lib/detention/types";
import { SkeletonSummaryCards } from "@/components/ui/skeleton";

function money(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
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

type SortDir = "asc" | "desc";

function SortTh<K extends string>({
  label,
  col,
  sortKey,
  sortDir,
  onSort,
  title,
  className,
}: {
  label: string;
  col: K;
  sortKey: K;
  sortDir: SortDir;
  onSort: (col: K) => void;
  title?: string;
  className?: string;
}) {
  const active = sortKey === col;
  return (
    <th
      className={clsx("px-3 py-3 font-medium sm:px-4", className)}
      title={title || label}
    >
      <button
        type="button"
        onClick={() => onSort(col)}
        className={clsx(
          "inline-flex max-w-full items-center gap-1 whitespace-nowrap uppercase tracking-wide transition-colors hover:text-slate-800",
          active ? "text-slate-800" : "text-slate-500"
        )}
      >
        <span className="truncate">{label}</span>
        {active ? (
          sortDir === "asc" ? (
            <ArrowUp size={12} className="shrink-0" />
          ) : (
            <ArrowDown size={12} className="shrink-0" />
          )
        ) : (
          <ArrowUpDown size={12} className="shrink-0 opacity-40" />
        )}
      </button>
    </th>
  );
}

type PeriodSortKey =
  | "label"
  | "submitted"
  | "submittedAmount"
  | "paid"
  | "collectedAmount"
  | "open"
  | "openAmount";

function comparePeriod(
  a: DetentionPeriodSummary,
  b: DetentionPeriodSummary,
  key: PeriodSortKey,
  dir: SortDir
): number {
  const mul = dir === "asc" ? 1 : -1;
  if (key === "label") {
    return mul * a.label.localeCompare(b.label, undefined, { numeric: true });
  }
  return mul * ((a[key] as number) - (b[key] as number));
}

function SummaryTable({
  title,
  rows,
  submittedHint,
  collectedHint,
  weekLimitNote,
  currentBadge,
}: {
  title: string;
  rows: DetentionPeriodSummary[];
  submittedHint: string;
  collectedHint: string;
  weekLimitNote?: string;
  currentBadge: string;
}) {
  const [sortKey, setSortKey] = useState<PeriodSortKey>("label");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Default: keep API order (newest period first). First click on a column sorts.
  const [userSorted, setUserSorted] = useState(false);

  const onSort = (col: PeriodSortKey) => {
    setUserSorted(true);
    if (sortKey === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col);
      setSortDir(col === "label" ? "desc" : "desc");
    }
  };

  const sorted = useMemo(() => {
    if (!userSorted) return rows;
    return [...rows].sort((a, b) => comparePeriod(a, b, sortKey, sortDir));
  }, [rows, userSorted, sortKey, sortDir]);

  return (
    <div className="xxii-card overflow-hidden">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Submitted = {submittedHint} Collected = {collectedHint}
        </p>
        {weekLimitNote ? (
          <p className="mt-1 text-xs text-muted-foreground">{weekLimitNote}</p>
        ) : null}
        <p className="mt-1 text-xs text-muted-foreground">
          Click a column header to sort. The in-progress period is marked{" "}
          <span className="font-semibold text-sky-800">{currentBadge}</span>.
        </p>
      </div>
      {!rows.length ? (
        <div className="p-6 text-sm text-muted-foreground">No data yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] table-fixed text-left text-sm">
            <colgroup>
              <col className="w-[22%]" />
              <col className="w-[13%]" />
              <col className="w-[13%]" />
              <col className="w-[10%]" />
              <col className="w-[14%]" />
              <col className="w-[13%]" />
              <col className="w-[15%]" />
            </colgroup>
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <SortTh
                  label="Period"
                  col="label"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={onSort}
                />
                <SortTh
                  label="Submitted"
                  col="submitted"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={onSort}
                  title={submittedHint}
                />
                <SortTh
                  label="Submitted $"
                  col="submittedAmount"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={onSort}
                  title={submittedHint}
                />
                <SortTh
                  label="Paid"
                  col="paid"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={onSort}
                />
                <SortTh
                  label="Collected $"
                  col="collectedAmount"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={onSort}
                  title={collectedHint}
                />
                <SortTh
                  label="Still open"
                  col="open"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={onSort}
                />
                <SortTh
                  label="Open $"
                  col="openAmount"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={onSort}
                />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.map((r) => (
                <tr
                  key={r.key}
                  className={clsx(
                    "hover:bg-slate-50/80",
                    r.isCurrent && "bg-sky-50/90 ring-1 ring-inset ring-sky-200"
                  )}
                >
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <div className="flex flex-wrap items-center gap-2">
                      <span>{r.label}</span>
                      {r.isCurrent ? (
                        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-800 ring-1 ring-sky-200">
                          {currentBadge}
                        </span>
                      ) : null}
                    </div>
                    {r.hint ? (
                      <div className="text-[11px] font-normal text-slate-400">
                        {r.hint}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{r.submitted}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {money(r.submittedAmount)}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{r.paid}</td>
                  <td className="px-4 py-3 font-semibold tabular-nums text-emerald-700">
                    {money(r.collectedAmount)}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{r.open}</td>
                  <td className="px-4 py-3 tabular-nums">{money(r.openAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

type DispatcherSortKey =
  | "dispatcher"
  | "submitted"
  | "approved"
  | "submittedAmount"
  | "paid"
  | "collectedAmount"
  | "collectionRate"
  | "open"
  | "openAmount";

function compareDispatcher(
  a: DetentionDispatcherSummary,
  b: DetentionDispatcherSummary,
  key: DispatcherSortKey,
  dir: SortDir
): number {
  const mul = dir === "asc" ? 1 : -1;
  if (key === "dispatcher") {
    return mul * a.dispatcher.localeCompare(b.dispatcher);
  }
  return mul * ((a[key] as number) - (b[key] as number));
}

function DispatcherTable({ rows }: { rows: DetentionDispatcherSummary[] }) {
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<DispatcherSortKey>("collectedAmount");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const onSort = (col: DispatcherSortKey) => {
    if (sortKey === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col);
      setSortDir(col === "dispatcher" ? "asc" : "desc");
    }
  };

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const base = !needle
      ? rows
      : rows.filter((r) => r.dispatcher.toLowerCase().includes(needle));
    return [...base].sort((a, b) =>
      compareDispatcher(a, b, sortKey, sortDir)
    );
  }, [rows, q, sortKey, sortDir]);

  return (
    <div className="xxii-card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">
            By dispatcher
          </h2>
          <p className="mt-0.5 max-w-xl text-xs text-muted-foreground">
            Submitted is every claim received. Detention Approved leaves out
            Denied — those are not real detentions. Rate % is paid claims
            divided by detention approved.
          </p>
        </div>
        {rows.length ? (
          <div className="relative w-full shrink-0 sm:w-56">
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Find dispatcher…"
              className="w-full rounded-lg border border-border bg-background py-1.5 pl-8 pr-2 text-sm outline-none focus:ring-2 focus:ring-[var(--xxii-brand,#1e4d9c)]"
            />
          </div>
        ) : null}
      </div>
      {!rows.length ? (
        <div className="p-6 text-sm text-muted-foreground">No data yet.</div>
      ) : !filtered.length ? (
        <div className="p-6 text-sm text-muted-foreground">
          No dispatcher matches “{q.trim()}”.
        </div>
      ) : (
        <div className="max-h-[min(60vh,560px)] overflow-auto">
          <table className="w-full min-w-[980px] table-fixed text-left text-sm">
            <colgroup>
              <col className="w-[16%]" />
              <col className="w-[10%]" />
              <col className="w-[14%]" />
              <col className="w-[11%]" />
              <col className="w-[7%]" />
              <col className="w-[12%]" />
              <col className="w-[8%]" />
              <col className="w-[10%]" />
              <col className="w-[12%]" />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <SortTh
                  label="Dispatcher"
                  col="dispatcher"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={onSort}
                />
                <SortTh
                  label="Submitted"
                  col="submitted"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={onSort}
                  title="Every claim received, including ones later denied"
                />
                <SortTh
                  label="Detention Approved"
                  col="approved"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={onSort}
                  title="Real detentions. Denied is excluded. This is the total the rate uses."
                />
                <SortTh
                  label="Submitted $"
                  col="submittedAmount"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={onSort}
                />
                <SortTh
                  label="Paid"
                  col="paid"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={onSort}
                />
                <SortTh
                  label="Collected $"
                  col="collectedAmount"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={onSort}
                  title="Total amount collected"
                />
                <SortTh
                  label="Rate %"
                  col="collectionRate"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={onSort}
                  title="Paid claims divided by detention approved. Denied is left out."
                />
                <SortTh
                  label="Still open"
                  col="open"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={onSort}
                />
                <SortTh
                  label="Open $"
                  col="openAmount"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={onSort}
                />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r) => (
                <tr key={r.dispatcher} className="hover:bg-slate-50/80">
                  <td
                    className="truncate px-3 py-3 font-medium text-slate-900 sm:px-4"
                    title={r.dispatcher}
                  >
                    {r.dispatcher}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 tabular-nums sm:px-4">
                    {r.submitted}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 tabular-nums sm:px-4">
                    {r.approved}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 tabular-nums sm:px-4">
                    {money(r.submittedAmount)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 tabular-nums sm:px-4">
                    {r.paid}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 font-semibold tabular-nums text-emerald-700 sm:px-4">
                    {money(r.collectedAmount)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 tabular-nums sm:px-4">
                    {r.collectionRate}%
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 tabular-nums sm:px-4">
                    {r.open}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 tabular-nums sm:px-4">
                    {money(r.openAmount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CustomersBilledTable({ rows }: { rows: DetentionPartyRow[] }) {
  return (
    <div className="xxii-card overflow-hidden">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-base font-semibold text-foreground">
          Customers by detention billed
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Name, detentions, hours, billed, received, and rate for the same
          filters as the tables above.
        </p>
      </div>
      {!rows.length ? (
        <div className="p-6 text-sm text-muted-foreground">No data yet.</div>
      ) : (
        <div className="max-h-[360px] overflow-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Detentions</th>
                <th className="px-4 py-2 font-medium">Hours</th>
                <th className="px-4 py-2 font-medium">Billed</th>
                <th className="px-4 py-2 font-medium">Received</th>
                <th className="px-4 py-2 font-medium">Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.name} className="hover:bg-slate-50/80">
                  <td className="px-4 py-2 font-medium">{r.name}</td>
                  <td className="px-4 py-2 tabular-nums">{r.detentions}</td>
                  <td className="px-4 py-2 tabular-nums">{r.hours}</td>
                  <td className="px-4 py-2 tabular-nums">{money(r.billed)}</td>
                  <td className="px-4 py-2 tabular-nums">{money(r.received)}</td>
                  <td className="px-4 py-2 tabular-nums">{r.rate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function DetentionSummaryView() {
  const [weeks, setWeeks] = useState<DetentionPeriodSummary[]>([]);
  const [months, setMonths] = useState<DetentionPeriodSummary[]>([]);
  const [dispatchers, setDispatchers] = useState<DetentionDispatcherSummary[]>(
    []
  );
  const [customers, setCustomers] = useState<DetentionPartyRow[]>([]);
  const [dispatcherOptions, setDispatcherOptions] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([...DETENTION_STATUSES]);
  const [days, setDays] = useState(90);
  const [status, setStatus] = useState("all");
  const [dispatcher, setDispatcher] = useState("all");
  const [emailDate, setEmailDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sp = new URLSearchParams();
      sp.set("days", String(days));
      if (status !== "all") sp.set("status", status);
      if (dispatcher !== "all") sp.set("dispatcher", dispatcher);
      if (emailDate) sp.set("emailDate", emailDate);
      const res = await fetch(`/api/detention/summary?${sp.toString()}`, {
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Failed to load summary");
      }
      setWeeks(json.data.weeks || []);
      setMonths(json.data.months || []);
      setDispatchers(json.data.dispatchers || []);
      setCustomers(json.data.customers || []);
      const opts = json.data.filterOptions;
      if (opts?.dispatchers?.length) setDispatcherOptions(opts.dispatchers);
      if (opts?.statuses?.length) setStatuses(opts.statuses);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [days, status, dispatcher, emailDate]);

  useEffect(() => {
    void load();
  }, [load]);

  const clearFilters = () => {
    setDays(90);
    setStatus("all");
    setDispatcher("all");
    setEmailDate("");
  };

  const filtersActive =
    days !== 90 || status !== "all" || dispatcher !== "all" || Boolean(emailDate);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
            Detention reporting
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Submitted vs collected by week, month, and dispatcher.
          </p>
        </div>
        <Link
          href="/detention"
          className="text-sm font-medium text-[var(--xxii-brand,#1e4d9c)] hover:underline"
        >
          ← Back to board
        </Link>
      </div>

      <div className="xxii-card overflow-hidden">
        <div className="space-y-3 border-b border-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <Filter size={14} className="text-slate-400" />
              Filters
            </div>
            {filtersActive ? (
              <button
                type="button"
                onClick={clearFilters}
                className="text-xs font-medium text-slate-500 underline hover:text-slate-800"
              >
                Reset to last 90 days
              </button>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
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
                onChange={(e) => setStatus(e.target.value)}
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
                {dispatcherOptions.map((d) => (
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
                  onChange={(e) => setEmailDate(e.target.value)}
                  className={clsx(filterControlClass, "min-w-0 flex-1")}
                  title="Show claims received on this date"
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
          </div>
        </div>
      </div>

      {error ? (
        <div className="flex items-center gap-2 text-sm text-rose-600">
          <AlertCircle size={16} />
          {error}
        </div>
      ) : null}

      {loading ? (
        <SkeletonSummaryCards count={3} />
      ) : (
        <>
          <SummaryTable
            title="By week"
            rows={weeks}
            submittedHint="Total claims received during each period listed below."
            collectedHint="Total amount collected for those claims."
            weekLimitNote="Shows the latest 26 Tuesday–Monday weeks (W##, same as Gross Profit) inside the selected filters. When a newer week appears, the oldest drops off the list."
            currentBadge="Current week"
          />
          <SummaryTable
            title="By month"
            rows={months}
            submittedHint="Total claims received during each month listed below."
            collectedHint="Total amount collected for those claims."
            currentBadge="Current month"
          />
          <DispatcherTable rows={dispatchers} />
          <CustomersBilledTable rows={customers} />
        </>
      )}
    </div>
  );
}
