"use client";

import {
  Fragment,
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
  ChevronDown,
  Filter,
  Search,
} from "lucide-react";
import clsx from "clsx";
import {
  DETENTION_STATUSES,
  type DetentionDispatcherSummary,
  type DetentionDispatcherTrend,
  type DetentionPartyRow,
  type DetentionComplianceGroup,
  type DetentionPeriodClaim,
  type DetentionPeriodSummary,
  type DetentionRateBar,
} from "@/lib/detention/types";
import { DetentionComplianceView } from "@/components/detention/DetentionComplianceView";
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
          "inline-flex max-w-full items-center gap-1 whitespace-normal text-left uppercase leading-tight tracking-wide transition-colors hover:text-slate-800",
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
  | "approved"
  | "submittedAmount"
  | "paid"
  | "collectedAmount"
  | "collectionRate"
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

function RateBar({
  bar,
  onClick,
  open,
}: {
  bar: DetentionRateBar;
  onClick?: () => void;
  open?: boolean;
}) {
  const width = Math.max(0, Math.min(bar.rate, 100));
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className="flex w-full items-center gap-2 text-left"
    >
      <span className="w-24 shrink-0 text-xs font-medium text-slate-700 sm:w-36">
        {bar.label}
        {bar.hint ? (
          <span className="mt-0.5 block font-normal text-[10px] text-slate-400">
            {bar.hint}
          </span>
        ) : null}
      </span>
      <span className="relative h-6 min-w-0 flex-1 overflow-hidden rounded bg-slate-100">
        <span
          className="block h-6 rounded bg-emerald-500"
          style={{ width: `${width}%` }}
        />
        <span className="absolute inset-0 flex items-center px-2 text-[11px] font-semibold text-slate-900">
          {bar.rate}%
        </span>
      </span>
      {onClick ? (
        <ChevronDown
          size={14}
          className={clsx("shrink-0 text-slate-400", open && "rotate-180")}
        />
      ) : null}
    </Tag>
  );
}

function SummaryTable({
  title,
  rows,
  submittedHint,
  collectedHint,
  weekLimitNote,
  currentBadge,
  kind,
  filterQuery,
}: {
  title: string;
  rows: DetentionPeriodSummary[];
  submittedHint: string;
  collectedHint: string;
  weekLimitNote?: string;
  currentBadge: string;
  kind: "week" | "month";
  filterQuery: string;
}) {
  const [sortKey, setSortKey] = useState<PeriodSortKey>("label");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Default: keep API order (newest period first). First click on a column sorts.
  const [userSorted, setUserSorted] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [claimsByKey, setClaimsByKey] = useState<
    Record<string, DetentionPeriodClaim[]>
  >({});
  const [claimError, setClaimError] = useState<string | null>(null);
  const [loadCustomer, setLoadCustomer] = useState("all");
  const [loadDispatcher, setLoadDispatcher] = useState("all");
  const [loadPaid, setLoadPaid] = useState("all");

  useEffect(() => {
    setOpenKey(null);
    setClaimsByKey({});
    setClaimError(null);
    setLoadCustomer("all");
    setLoadDispatcher("all");
    setLoadPaid("all");
  }, [filterQuery]);

  const togglePeriod = async (key: string) => {
    setClaimError(null);
    if (openKey === key) {
      setOpenKey(null);
      return;
    }
    setOpenKey(key);
    if (claimsByKey[key]) return;
    const res = await fetch(
      `/api/detention/summary/detail?kind=${kind}&key=${encodeURIComponent(key)}&${filterQuery}`,
      { credentials: "include" }
    );
    const json = await res.json();
    if (!res.ok || !json.ok) {
      setClaimError(json.error || "Could not load detentions");
      return;
    }
    setClaimsByKey((current) => ({
      ...current,
      [key]: json.data.claims || [],
    }));
  };

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

  const shownClaims = (claims: DetentionPeriodClaim[]) => {
    if (kind !== "week") return claims;
    return claims.filter((claim) => {
      if (loadCustomer !== "all" && (claim.customer || "") !== loadCustomer) return false;
      if (loadDispatcher !== "all" && (claim.dispatcher || "") !== loadDispatcher) return false;
      if (loadPaid === "paid" && !claim.paid) return false;
      if (loadPaid === "unpaid" && claim.paid) return false;
      return true;
    });
  };

  const loadFilters = (claims: DetentionPeriodClaim[]) => {
    if (kind !== "week") return null;
    const customers = [...new Set(claims.map((c) => c.customer || "").filter(Boolean))].sort();
    const dispatchers = [...new Set(claims.map((c) => c.dispatcher || "").filter(Boolean))].sort();
    return (
      <div className="mb-2 flex flex-wrap gap-2">
        <select value={loadCustomer} onChange={(e) => setLoadCustomer(e.target.value)} className="rounded border border-border bg-background px-2 py-1 text-xs">
          <option value="all">All customers</option>
          {customers.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <select value={loadDispatcher} onChange={(e) => setLoadDispatcher(e.target.value)} className="rounded border border-border bg-background px-2 py-1 text-xs">
          <option value="all">All dispatchers</option>
          {dispatchers.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <select value={loadPaid} onChange={(e) => setLoadPaid(e.target.value)} className="rounded border border-border bg-background px-2 py-1 text-xs">
          <option value="all">Paid and unpaid</option>
          <option value="paid">Paid</option>
          <option value="unpaid">Not paid</option>
        </select>
      </div>
    );
  };

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
          Submitted includes denied. Approved leaves denied out. % collected is
          paid claims divided by approved. Click a {kind} to see its approved
          detentions. The in-progress period is marked{" "}
          <span className="font-semibold text-sky-800">{currentBadge}</span>.
        </p>
      </div>
      {!rows.length ? (
        <div className="p-6 text-sm text-muted-foreground">No data yet.</div>
      ) : (
        <>
        <div className="max-h-[55dvh] space-y-2 overflow-y-auto p-3 xl:hidden">
          {sorted.map((r) => {
            const open = openKey === r.key;
            const claims = claimsByKey[r.key];
            return (
              <div
                key={r.key}
                className={clsx(
                  "rounded-xl border border-border p-3",
                  r.isCurrent && "bg-sky-50"
                )}
              >
                <button
                  type="button"
                  onClick={() => void togglePeriod(r.key)}
                  className="flex w-full items-center gap-2 text-left text-sm font-semibold text-[var(--xxii-brand,#1e4d9c)]"
                >
                  <ChevronDown
                    size={14}
                    className={clsx("shrink-0 text-slate-400", open && "rotate-180")}
                  />
                  <span className="min-w-0 flex-1">{r.label}</span>
                  <span className="shrink-0 tabular-nums">{r.collectionRate}%</span>
                </button>
                {r.hint ? (
                  <p className="mt-1 pl-5 text-[11px] text-slate-400">{r.hint}</p>
                ) : null}
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:grid-cols-3">
                  <div><dt className="text-slate-500">Submitted</dt><dd className="tabular-nums">{r.submitted}</dd></div>
                  <div><dt className="text-slate-500">Approved</dt><dd className="tabular-nums">{r.approved}</dd></div>
                  <div><dt className="text-slate-500">Submitted $</dt><dd className="tabular-nums">{money(r.submittedAmount)}</dd></div>
                  <div><dt className="text-slate-500">Paid</dt><dd className="tabular-nums">{r.paid}</dd></div>
                  <div><dt className="text-slate-500">Collected $</dt><dd className="font-semibold tabular-nums text-emerald-700">{money(r.collectedAmount)}</dd></div>
                  <div><dt className="text-slate-500">Still open</dt><dd className="tabular-nums">{r.open} · {money(r.openAmount)}</dd></div>
                </dl>
                {open ? (
                  <div className="mt-2 space-y-2 border-t border-border pt-2">
                    {claimError ? (
                      <p className="text-sm text-rose-600">{claimError}</p>
                    ) : !claims ? (
                      <p className="text-sm text-slate-500">Loading…</p>
                    ) : claims.length === 0 ? (
                      <p className="text-sm text-slate-500">No approved detentions.</p>
                    ) : (
                      <>
                      {loadFilters(claims)}
                      {shownClaims(claims).length === 0 ? (
                        <p className="text-sm text-slate-500">No loads match these filters.</p>
                      ) : null}
                      {shownClaims(claims).map((claim) => (
                        <div key={claim.id} className="grid grid-cols-2 gap-1 text-xs">
                          <div className="col-span-2 font-medium">
                            {claim.paid && claim.loadLink ? (
                              <a href={claim.loadLink} target="_blank" rel="noreferrer" className="text-[var(--xxii-brand,#1e4d9c)] underline">
                                {claim.loadNumber || "OpenRoad load"}
                              </a>
                            ) : (
                              claim.loadNumber || "—"
                            )}
                          </div>
                          <span>{claim.customer || "—"} · {claim.dispatcher || "—"}</span>
                          <span className="text-right">{claim.paid ? "Paid" : "Not paid"} · {claim.amount == null ? "—" : money(claim.amount)}</span>
                        </div>
                      ))}
                      </>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="hidden max-h-[min(50dvh,36rem)] overflow-auto xl:block">
          <table className="w-full table-fixed text-left text-xs">
            <colgroup>
              <col className="w-[16%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[12%]" />
              <col className="w-[8%]" />
              <col className="w-[12%]" />
              <col className="w-[10%]" />
              <col className="w-[11%]" />
              <col className="w-[11%]" />
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
                  title="Every claim received, including denied"
                />
                <SortTh
                  label="Approved"
                  col="approved"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={onSort}
                  title="Approved detentions. Denied is left out. % collected uses this count."
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
                  label="% collected"
                  col="collectionRate"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={onSort}
                  title="Paid claims divided by approved detentions"
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
              {sorted.map((r) => {
                const open = openKey === r.key;
                const claims = claimsByKey[r.key];
                return (
                <Fragment key={r.key}>
                <tr
                  className={clsx(
                    "hover:bg-slate-50/80",
                    r.isCurrent && "bg-sky-50/90 ring-1 ring-inset ring-sky-200"
                  )}
                >
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <button
                      type="button"
                      onClick={() => void togglePeriod(r.key)}
                      className="flex flex-wrap items-center gap-2 text-left text-[var(--xxii-brand,#1e4d9c)] hover:underline"
                    >
                      <ChevronDown
                        size={14}
                        className={clsx("text-slate-400", open && "rotate-180")}
                      />
                      <span>{r.label}</span>
                      {r.isCurrent ? (
                        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-800 ring-1 ring-sky-200">
                          {currentBadge}
                        </span>
                      ) : null}
                    </button>
                    {r.hint ? (
                      <div className="pl-5 text-[11px] font-normal text-slate-400">
                        {r.hint}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{r.submitted}</td>
                  <td className="px-4 py-3 tabular-nums">{r.approved}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {money(r.submittedAmount)}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{r.paid}</td>
                  <td className="px-4 py-3 font-semibold tabular-nums text-emerald-700">
                    {money(r.collectedAmount)}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{r.collectionRate}%</td>
                  <td className="px-4 py-3 tabular-nums">{r.open}</td>
                  <td className="px-4 py-3 tabular-nums">{money(r.openAmount)}</td>
                </tr>
                {open ? (
                  <tr className="bg-slate-50/80">
                    <td colSpan={9} className="px-4 py-3">
                      {claimError ? (
                        <p className="text-sm text-rose-600">{claimError}</p>
                      ) : !claims ? (
                        <p className="text-sm text-slate-500">Loading…</p>
                      ) : claims.length === 0 ? (
                        <p className="text-sm text-slate-500">
                          No approved detentions.
                        </p>
                      ) : (
                        <>
                        {loadFilters(claims)}
                        {shownClaims(claims).length === 0 ? (
                          <p className="mb-2 text-sm text-slate-500">No loads match these filters.</p>
                        ) : null}
                        <table className="w-full text-left text-xs">
                          <thead className="text-slate-500">
                            <tr>
                              <th className="py-1 pr-3 font-medium">Load</th>
                              <th className="py-1 pr-3 font-medium">Customer</th>
                              <th className="py-1 pr-3 font-medium">Dispatcher</th>
                              <th className="py-1 pr-3 font-medium">Amount</th>
                              <th className="py-1 font-medium">Paid</th>
                            </tr>
                          </thead>
                          <tbody>
                            {shownClaims(claims).map((claim) => (
                              <tr key={claim.id} className="border-t border-slate-200">
                                <td className="py-1.5 pr-3">
                                  {claim.paid && claim.loadLink ? (
                                    <a
                                      href={claim.loadLink}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="font-medium text-[var(--xxii-brand,#1e4d9c)] hover:underline"
                                    >
                                      {claim.loadNumber || "OpenRoad load"}
                                    </a>
                                  ) : (
                                    claim.loadNumber || "—"
                                  )}
                                </td>
                                <td className="py-1.5 pr-3">{claim.customer || "—"}</td>
                                <td className="py-1.5 pr-3">{claim.dispatcher || "—"}</td>
                                <td className="py-1.5 pr-3 tabular-nums">
                                  {claim.amount == null ? "—" : money(claim.amount)}
                                </td>
                                <td className="py-1.5">
                                  {claim.paid ? (
                                    <span className="font-semibold text-emerald-700">Paid</span>
                                  ) : (
                                    "Not paid"
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        </>
                      )}
                    </td>
                  </tr>
                ) : null}
                </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
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

function complianceFor(
  groups: DetentionComplianceGroup[],
  name: string
) {
  const group = groups.find(
    (g) => g.dispatcher.toLowerCase() === name.toLowerCase()
  );
  const answered = group ? group.ok + group.pending + group.noFollowUp : 0;
  const notAnswered = group?.missed ?? 0;
  const base = answered + notAnswered;
  return {
    answered,
    notAnswered,
    rate: base ? Math.round((answered / base) * 1000) / 10 : 0,
  };
}

function DispatcherTable({
  rows,
  filterQuery,
  compliance,
}: {
  rows: DetentionDispatcherSummary[];
  compliance: DetentionComplianceGroup[];
  filterQuery: string;
}) {
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<DispatcherSortKey>("collectedAmount");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [openName, setOpenName] = useState<string | null>(null);
  const [openMonth, setOpenMonth] = useState<string | null>(null);
  const [trends, setTrends] = useState<Record<string, DetentionDispatcherTrend>>(
    {}
  );
  const [trendError, setTrendError] = useState<string | null>(null);

  useEffect(() => {
    setOpenName(null);
    setOpenMonth(null);
    setTrends({});
    setTrendError(null);
  }, [filterQuery]);

  const toggleDispatcher = async (name: string) => {
    setTrendError(null);
    setOpenMonth(null);
    if (openName === name) {
      setOpenName(null);
      return;
    }
    setOpenName(name);
    if (trends[name]) return;
    const res = await fetch(
      `/api/detention/summary/detail?kind=dispatcher&key=${encodeURIComponent(name)}&${filterQuery}`,
      { credentials: "include" }
    );
    const json = await res.json();
    if (!res.ok || !json.ok) {
      setTrendError(json.error || "Could not load the trend");
      return;
    }
    setTrends((current) => ({ ...current, [name]: json.data }));
  };

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
            divided by detention approved. Click a name for the monthly rate,
            then a month for that month&apos;s weeks.
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
        <>
        <div className="max-h-[55dvh] space-y-2 overflow-y-auto p-3 xl:hidden">
          {filtered.map((r) => {
            const open = openName === r.dispatcher;
            const trend = trends[r.dispatcher];
            return (
              <div key={r.dispatcher} className="rounded-xl border border-border p-3">
                <button
                  type="button"
                  onClick={() => void toggleDispatcher(r.dispatcher)}
                  className="flex w-full items-center gap-2 text-left text-sm font-semibold text-[var(--xxii-brand,#1e4d9c)]"
                >
                  <ChevronDown size={14} className={clsx("shrink-0", open && "rotate-180")} />
                  <span className="min-w-0 flex-1 truncate">{r.dispatcher}</span>
                  <span className="shrink-0 tabular-nums">{r.collectionRate}%</span>
                </button>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:grid-cols-3">
                  <div><dt className="text-slate-500">Submitted</dt><dd>{r.submitted}</dd></div>
                  <div><dt className="text-slate-500">Approved</dt><dd>{r.approved}</dd></div>
                  <div><dt className="text-slate-500">Paid</dt><dd>{r.paid}</dd></div>
                  <div><dt className="text-slate-500">Collected</dt><dd className="font-semibold text-emerald-700">{money(r.collectedAmount)}</dd></div>
                  <div><dt className="text-slate-500">Open</dt><dd>{r.open} · {money(r.openAmount)}</dd></div>
                  <div><dt className="text-slate-500">Answered</dt><dd>{complianceFor(compliance, r.dispatcher).answered}</dd></div>
                  <div><dt className="text-slate-500">Not answered</dt><dd>{complianceFor(compliance, r.dispatcher).notAnswered}</dd></div>
                  <div><dt className="text-slate-500">Compliance</dt><dd>{complianceFor(compliance, r.dispatcher).rate}%</dd></div>
                </dl>
                {open ? (
                  <div className="mt-2 space-y-2 border-t border-border pt-2">
                    {trendError ? <p className="text-sm text-rose-600">{trendError}</p> : !trend ? <p className="text-sm text-slate-500">Loading…</p> : trend.months.length === 0 ? <p className="text-sm text-slate-500">No approved detentions in this range.</p> : trend.months.map((month) => (
                      <div key={month.key}>
                        <RateBar bar={month} open={openMonth === month.key} onClick={() => setOpenMonth((current) => current === month.key ? null : month.key)} />
                        {openMonth === month.key ? <div className="mt-1 space-y-1 pl-2">{month.weeks.map((week) => <RateBar key={week.key} bar={week} />)}</div> : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="hidden max-h-[min(50dvh,36rem)] overflow-auto xl:block">
          <table className="w-full table-fixed text-left text-xs">
            <colgroup>
              <col className="w-[14%]" />
              <col className="w-[8%]" />
              <col className="w-[11%]" />
              <col className="w-[9%]" />
              <col className="w-[6%]" />
              <col className="w-[10%]" />
              <col className="w-[7%]" />
              <col className="w-[8%]" />
              <col className="w-[9%]" />
              <col className="w-[6%]" />
              <col className="w-[6%]" />
              <col className="w-[6%]" />
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
                <th className="px-3 py-3 font-bold">Answered</th>
                <th className="px-3 py-3 font-bold">Not answered</th>
                <th className="px-3 py-3 font-bold">Compliance %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r) => {
                const open = openName === r.dispatcher;
                const trend = trends[r.dispatcher];
                return (
                <Fragment key={r.dispatcher}>
                <tr className="hover:bg-slate-50/80">
                  <td
                    className="truncate px-3 py-3 font-medium sm:px-4"
                    title={r.dispatcher}
                  >
                    <button
                      type="button"
                      onClick={() => void toggleDispatcher(r.dispatcher)}
                      className="inline-flex max-w-full items-center gap-1 text-left text-[var(--xxii-brand,#1e4d9c)] hover:underline"
                    >
                      <ChevronDown
                        size={14}
                        className={clsx(
                          "shrink-0 text-slate-400",
                          open && "rotate-180"
                        )}
                      />
                      <span className="truncate">{r.dispatcher}</span>
                    </button>
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
                  <td className="whitespace-nowrap px-3 py-3 tabular-nums text-emerald-700 sm:px-4">
                    {complianceFor(compliance, r.dispatcher).answered}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 tabular-nums text-rose-700 sm:px-4">
                    {complianceFor(compliance, r.dispatcher).notAnswered}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 tabular-nums sm:px-4">
                    {complianceFor(compliance, r.dispatcher).rate}%
                  </td>
                </tr>
                {open ? (
                  <tr className="bg-slate-50/80">
                    <td colSpan={12} className="px-4 py-3">
                      {trendError ? (
                        <p className="text-sm text-rose-600">{trendError}</p>
                      ) : !trend ? (
                        <p className="text-sm text-slate-500">Loading…</p>
                      ) : trend.months.length === 0 ? (
                        <p className="text-sm text-slate-500">
                          No approved detentions in this range.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {trend.months.map((month) => (
                            <div key={month.key} className="space-y-2">
                              <RateBar
                                bar={month}
                                open={openMonth === month.key}
                                onClick={() =>
                                  setOpenMonth((current) =>
                                    current === month.key ? null : month.key
                                  )
                                }
                              />
                              {openMonth === month.key ? (
                                <div className="space-y-1.5 pl-6">
                                  {month.weeks.map((week) => (
                                    <RateBar key={week.key} bar={week} />
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ) : null}
                </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}

type CustomerSortKey = "name" | "detentions" | "hours" | "billed" | "received" | "rate";

function CustomersBilledTable({ rows }: { rows: DetentionPartyRow[] }) {
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<CustomerSortKey>("billed");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const onSort = (col: CustomerSortKey) => {
    if (sortKey === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(col);
      setSortDir(col === "name" ? "asc" : "desc");
    }
  };

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const base = !needle
      ? rows
      : rows.filter((r) => r.name.toLowerCase().includes(needle));
    const mul = sortDir === "asc" ? 1 : -1;
    return [...base].sort((a, b) =>
      sortKey === "name"
        ? mul * a.name.localeCompare(b.name)
        : mul * (a[sortKey] - b[sortKey])
    );
  }, [rows, q, sortKey, sortDir]);

  return (
    <div className="xxii-card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            Customers by detention billed
          </h2>
          <p className="mt-0.5 max-w-xl text-xs text-muted-foreground">
            {rows.length} customers. The same customer is combined when the
            name only differs by Inc, LLC, or an extra word such as Logistics.
            Needs attention marks the three largest gaps between billed and
            received. Click a column header to sort.
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
              placeholder="Find customer…"
              className="w-full rounded-lg border border-border bg-background py-1.5 pl-8 pr-2 text-sm outline-none focus:ring-2 focus:ring-[var(--xxii-brand,#1e4d9c)]"
            />
          </div>
        ) : null}
      </div>
      {!rows.length ? (
        <div className="p-6 text-sm text-muted-foreground">No data yet.</div>
      ) : (
        <>
        <div className="max-h-[55dvh] space-y-2 overflow-y-auto p-3 xl:hidden">
          {filtered.map((r) => (
            <div key={r.name} className="rounded-xl border border-border p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                <span className="min-w-0">{r.name}</span>
                {r.needsAttention ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-900">Needs attention</span>
                ) : null}
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:grid-cols-3">
                <div><dt className="text-slate-500">Detentions</dt><dd>{r.detentions}</dd></div>
                <div><dt className="text-slate-500">Hours</dt><dd>{r.hours}</dd></div>
                <div><dt className="text-slate-500">Billed</dt><dd>{money(r.billed)}</dd></div>
                <div><dt className="text-slate-500">Received</dt><dd>{money(r.received)}</dd></div>
                <div><dt className="text-slate-500">Rate</dt><dd>{r.rate}%</dd></div>
              </dl>
            </div>
          ))}
        </div>
        <div className="hidden max-h-[min(50dvh,36rem)] overflow-auto xl:block">
          <table className="w-full table-fixed text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <SortTh label="Name" col="name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortTh label="Detentions" col="detentions" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortTh label="Hours" col="hours" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortTh label="Billed" col="billed" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortTh label="Received" col="received" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortTh label="Rate" col="rate" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r) => (
                <tr key={r.name} className="hover:bg-slate-50/80">
                  <td className="px-4 py-2 font-medium">
                    <div className="flex flex-wrap items-center gap-2">
                      <span>{r.name}</span>
                      {r.needsAttention ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">
                          Needs attention
                        </span>
                      ) : null}
                    </div>
                  </td>
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
        </>
      )}
    </div>
  );
}

function weeksInMonth(
  weeks: DetentionPeriodSummary[],
  ym: string
): DetentionPeriodSummary[] {
  return weeks.filter((week) => (week.hint || "").slice(0, 7) === ym);
}

function MonthWeekBoard({
  months,
  weeks,
  filterQuery,
}: {
  months: DetentionPeriodSummary[];
  weeks: DetentionPeriodSummary[];
  filterQuery: string;
}) {
  const [openMonth, setOpenMonth] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <div className="xxii-card overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-base font-semibold text-foreground">By month</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Months first. Open a month to see its weeks, then open a week to
            see each load. Paid loads still open in OpenRoad.
          </p>
        </div>
        {!months.length ? (
          <div className="p-6 text-sm text-muted-foreground">No data yet.</div>
        ) : (
          <div className="divide-y divide-border">
            {months.map((month) => {
              const open = openMonth === month.key;
              const monthWeeks = weeksInMonth(weeks, month.key);
              return (
                <div key={month.key}>
                  <button
                    type="button"
                    onClick={() =>
                      setOpenMonth((current) =>
                        current === month.key ? null : month.key
                      )
                    }
                    className={clsx(
                      "flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left text-sm hover:bg-slate-50",
                      month.isCurrent && "bg-sky-50"
                    )}
                  >
                    <ChevronDown
                      size={14}
                      className={clsx("text-slate-400", open && "rotate-180")}
                    />
                    <span className="min-w-0 flex-1 font-semibold text-[var(--xxii-brand,#1e4d9c)]">
                      {month.label}
                      {month.isCurrent ? (
                        <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-800">
                          Current month
                        </span>
                      ) : null}
                    </span>
                    <span className="tabular-nums text-xs text-slate-600">
                      Submitted {month.submitted} · Approved {month.approved} ·
                      Paid {month.paid} · {money(month.collectedAmount)} ·{" "}
                      {month.collectionRate}%
                    </span>
                  </button>
                  {open ? (
                    <div className="border-t border-border bg-slate-50/70 p-3">
                      <SummaryTable
                        title="By week"
                        rows={monthWeeks}
                        kind="week"
                        filterQuery={filterQuery}
                        submittedHint="Total claims received during each week below, including denied."
                        collectedHint="Total amount collected for those claims."
                        weekLimitNote="Weeks are Tuesday–Monday, the same as Gross Profit."
                        currentBadge="Current week"
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
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
  const [customer, setCustomer] = useState("all");
  const [paid, setPaid] = useState("all");
  const [customerOptions, setCustomerOptions] = useState<string[]>([]);
  const [emailDate, setEmailDate] = useState("");
  const [compliance, setCompliance] = useState<DetentionComplianceGroup[]>([]);
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
      if (customer !== "all") sp.set("customer", customer);
      if (paid !== "all") sp.set("paid", paid);
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
      if (opts?.customers?.length) setCustomerOptions(opts.customers);
      if (opts?.statuses?.length) setStatuses(opts.statuses);
      try {
        const complianceRes = await fetch("/api/detention/compliance", {
          credentials: "include",
        });
        const complianceJson = await complianceRes.json();
        if (complianceJson.ok) setCompliance(complianceJson.data.groups || []);
      } catch {
        setCompliance([]);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [days, status, dispatcher, customer, paid, emailDate]);

  useEffect(() => {
    void load();
  }, [load]);

  const clearFilters = () => {
    setDays(90);
    setStatus("all");
    setDispatcher("all");
    setCustomer("all");
    setPaid("all");
    setEmailDate("");
  };

  const filtersActive =
    days !== 90 ||
    status !== "all" ||
    dispatcher !== "all" ||
    customer !== "all" ||
    paid !== "all" ||
    Boolean(emailDate);

  const filterQuery = useMemo(() => {
    const sp = new URLSearchParams();
    sp.set("days", String(days));
    if (status !== "all") sp.set("status", status);
    if (dispatcher !== "all") sp.set("dispatcher", dispatcher);
    if (customer !== "all") sp.set("customer", customer);
    if (paid !== "all") sp.set("paid", paid);
    if (emailDate) sp.set("emailDate", emailDate);
    return sp.toString();
  }, [days, status, dispatcher, customer, paid, emailDate]);

  return (
    <div className="w-full min-w-0 max-w-full space-y-4 overflow-x-hidden">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">
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
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
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
            <FilterControl label="Customer">
              <select
                value={customer}
                onChange={(e) => setCustomer(e.target.value)}
                className={filterControlClass}
              >
                <option value="all">All customers</option>
                {customerOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </FilterControl>
            <FilterControl label="Paid">
              <select
                value={paid}
                onChange={(e) => setPaid(e.target.value)}
                className={filterControlClass}
              >
                <option value="all">Paid and unpaid</option>
                <option value="paid">Paid</option>
                <option value="unpaid">Not paid</option>
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
          <MonthWeekBoard
            months={months}
            weeks={weeks}
            filterQuery={filterQuery}
          />
          <DispatcherTable
            rows={dispatchers}
            filterQuery={filterQuery}
            compliance={compliance}
          />
          <DetentionComplianceView part="dispatcher" trajectoryOnly />
          <CustomersBilledTable rows={customers} />
        </>
      )}
    </div>
  );
}
