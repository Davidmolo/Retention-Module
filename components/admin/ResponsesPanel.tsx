"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Send,
  Sparkles,
} from "lucide-react";
import clsx from "clsx";
import { MAX_SURVEY_REMINDERS } from "@/lib/retention/constants";
import { StatusPill, Stars, DepartmentRatingsCell } from "./ui";
import { prefetchDriverDetail } from "@/lib/retention/driverCache";
import {
  navigateRetentionView,
  type ResponsesFilter,
} from "@/lib/retention/viewNav";

type InsightComment = {
  text: string;
  dispatcher: string | null;
  driverId: string;
  driverName: string | null;
};

type DepartmentInsight = {
  department: string;
  average: number | null;
  count: number;
  lowCount: number;
  summary: string;
  highlights: string[];
  sampleComments: InsightComment[];
};

type InsightsData = {
  month: string | null;
  monthsAvailable: string[];
  totalAverage: number | null;
  totalRated: number;
  departments: DepartmentInsight[];
  aiUsed: boolean;
};

type ResponseRow = {
  id: string;
  kind: "response" | "pending" | "non_response";
  date: string;
  driverId: string;
  driverName: string;
  overallRating: number | null;
  department: string | null;
  departmentRatings: { department: string; rating: number }[];
  status: string;
  comment: string;
  submittedBy?: "driver" | "admin";
  reminderCount?: number;
};

type PageData = {
  filter: ResponsesFilter;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  query?: string;
  items: ResponseRow[];
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

async function fetchResponsesPage(
  page: number,
  filter: ResponsesFilter,
  q: string
): Promise<PageData> {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: "20",
    filter,
  });
  if (q.trim()) params.set("q", q.trim());
  const res = await fetch(`/api/retention/responses?${params}`, {
    cache: "no-store",
  });
  const json = await res.json();
  if (!res.ok || !json.ok) {
    throw new Error(json.error || "Failed to load responses");
  }
  return json.data as PageData;
}

export function ResponsesPanel({
  initialFilter = "all",
  onBack,
}: {
  initialFilter?: ResponsesFilter;
  onBack: () => void;
}) {
  const [filter, setFilter] = useState<ResponsesFilter>(initialFilter);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [data, setData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFilter(initialFilter);
    setPage(1);
  }, [initialFilter]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(t);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchResponsesPage(page, filter, debouncedQuery)
      .then((next) => {
        if (cancelled) return;
        setData(next);
        if (next.page !== page) setPage(next.page);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setError(e.message || "Failed to load responses");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [page, filter, debouncedQuery]);

  const setFilterAndUrl = useCallback((next: ResponsesFilter) => {
    setFilter(next);
    setPage(1);
    navigateRetentionView("responses", {
      filter: next === "all" ? undefined : next,
    });
  }, []);

  const prefetch = useCallback((id: string) => {
    prefetchDriverDetail(id);
  }, []);

  const rows = data?.items || [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const from = total === 0 ? 0 : (page - 1) * (data?.pageSize || 20) + 1;
  const to = Math.min(page * (data?.pageSize || 20), total);
  const emptyMessage = debouncedQuery
    ? "No matches for that search"
    : filter === "pending"
      ? "No pending surveys right now"
      : filter === "completed"
        ? "No completed responses yet"
        : filter === "non_response"
          ? "No expired / non-response surveys"
          : "No survey activity yet";

  return (
    <div className="w-full min-w-0 max-w-full space-y-4 overflow-x-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--xxii-blue)]">
            Retention · Responses
          </div>
          <h2 className="mt-1 text-xl font-extrabold tracking-tight text-[var(--xxii-text)]">
            All survey responses
          </h2>
          <p className="mt-1 text-sm text-[var(--xxii-muted)]">
            Browse completed, pending, or non-response surveys
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-200"
        >
          Back to Overview
        </button>
      </div>

      <DepartmentInsightsBlock />

      <section className="xxii-card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-[var(--xxii-line)] px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              <FilterChip
                active={filter === "all"}
                onClick={() => setFilterAndUrl("all")}
                label="All"
              />
              <FilterChip
                active={filter === "completed"}
                onClick={() => setFilterAndUrl("completed")}
                label="Completed"
              />
              <FilterChip
                active={filter === "pending"}
                onClick={() => setFilterAndUrl("pending")}
                label="Pending"
              />
              <FilterChip
                active={filter === "non_response"}
                onClick={() => setFilterAndUrl("non_response")}
                label="No response"
              />
            </div>
            <span className="self-start rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600 sm:self-auto">
              {loading && !data
                ? "Loading…"
                : total === 0
                  ? "0 shown"
                  : `${from}–${to} of ${total}`}
            </span>
          </div>
          <label className="relative block w-full sm:max-w-sm">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search drivers, comments, status…"
              className="w-full rounded-xl border border-[var(--xxii-line)] bg-white py-2 pl-8 pr-3 text-sm outline-none focus:border-[var(--xxii-blue)]"
            />
          </label>
        </div>

        {error && (
          <div className="px-5 py-8 text-center text-sm text-rose-600">{error}</div>
        )}

        {!error && (
          <>
            <div
              className={clsx(
                "space-y-3 p-3 md:hidden",
                loading && "opacity-60"
              )}
            >
              {rows.map((row) => (
                <Link
                  key={row.id}
                  href={`/retention/drivers/${row.driverId}`}
                  onMouseEnter={() => prefetch(row.driverId)}
                  onFocus={() => prefetch(row.driverId)}
                  className="block rounded-xl border border-[var(--xxii-line)] bg-white p-3.5 hover:border-sky-200 hover:bg-sky-50/40"
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-[var(--xxii-text)]">
                        {row.driverName}
                      </div>
                      <div className="mt-0.5 text-xs text-[var(--xxii-muted)]">
                        {formatDate(row.date)}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <StatusPill status={row.status} />
                      {row.kind === "response" &&
                      row.submittedBy === "admin" ? (
                        <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700 ring-1 ring-violet-200">
                          Admin test
                        </span>
                      ) : null}
                      {row.kind !== "response" &&
                      (row.reminderCount ?? 0) > 0 ? (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 ring-1 ring-amber-200">
                          Reminder {row.reminderCount} of {MAX_SURVEY_REMINDERS}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {row.overallRating != null ? (
                    <Stars value={row.overallRating} size="sm" />
                  ) : (
                    <span className="text-xs font-medium text-slate-400">
                      {row.kind === "non_response"
                        ? "Link expired — no submit"
                        : "Awaiting reply"}
                    </span>
                  )}
                  {row.kind === "response" && (
                    <div className="mt-2">
                      <DepartmentRatingsCell ratings={row.departmentRatings} />
                    </div>
                  )}
                  {row.comment ? (
                    <p className="mt-2 line-clamp-2 text-sm text-slate-600">
                      {row.comment}
                    </p>
                  ) : null}
                </Link>
              ))}
              {!loading && !rows.length && (
                <div className="py-10 text-center text-sm text-slate-400">
                  {emptyMessage}
                </div>
              )}
              {loading && !rows.length && (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-28 animate-pulse rounded-xl bg-slate-100"
                    />
                  ))}
                </div>
              )}
            </div>

            <div
              className={clsx(
                "hidden max-w-full overflow-x-auto md:block",
                loading && "opacity-60"
              )}
            >
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-slate-50/80 text-[11px] uppercase tracking-wide text-[var(--xxii-muted)]">
                  <tr>
                    <th className="px-5 py-3 text-left font-bold">Date</th>
                    <th className="px-5 py-3 text-left font-bold">Driver</th>
                    <th className="px-5 py-3 text-left font-bold">Rating</th>
                    <th className="px-5 py-3 text-left font-bold">Department</th>
                    <th className="px-5 py-3 text-left font-bold">Status</th>
                    <th className="px-5 py-3 text-left font-bold">Comment</th>
                    <th className="px-5 py-3 text-right font-bold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-t border-[var(--xxii-line)] hover:bg-sky-50/40"
                    >
                      <td className="whitespace-nowrap px-5 py-3.5 text-slate-600">
                        {formatDate(row.date)}
                      </td>
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/retention/drivers/${row.driverId}`}
                          onMouseEnter={() => prefetch(row.driverId)}
                          className="font-semibold text-[var(--xxii-text)] hover:text-[var(--xxii-blue)]"
                        >
                          {row.driverName}
                        </Link>
                      </td>
                      <td className="px-5 py-3.5">
                        {row.overallRating != null ? (
                          <Stars value={row.overallRating} size="sm" />
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        {row.kind === "response" ? (
                          <DepartmentRatingsCell
                            ratings={row.departmentRatings}
                          />
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex flex-col items-start gap-1">
                          <StatusPill status={row.status} />
                          {row.kind === "response" &&
                          row.submittedBy === "admin" ? (
                            <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700 ring-1 ring-violet-200">
                              Admin test
                            </span>
                          ) : null}
                          {row.kind !== "response" &&
                          (row.reminderCount ?? 0) > 0 ? (
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 ring-1 ring-amber-200">
                              Reminder {row.reminderCount} of {MAX_SURVEY_REMINDERS}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="max-w-[260px] truncate px-5 py-3.5 text-slate-600">
                        {row.comment || "—"}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <Link
                          href={`/retention/drivers/${row.driverId}`}
                          onMouseEnter={() => prefetch(row.driverId)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--xxii-blue-soft)] px-2.5 py-1.5 text-xs font-bold text-[var(--xxii-blue)] hover:bg-sky-100"
                        >
                          <Send size={12} />
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {!loading && !rows.length && (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-5 py-12 text-center text-slate-400"
                      >
                        {emptyMessage}
                      </td>
                    </tr>
                  )}
                  {loading && !rows.length && (
                    <tr>
                      <td colSpan={7} className="px-5 py-12">
                        <div className="mx-auto h-8 w-48 animate-pulse rounded-lg bg-slate-100" />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {totalPages > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--xxii-line)] px-4 py-3 sm:px-5">
            <p className="text-xs text-[var(--xxii-muted)]">
              Page {page} of {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft size={14} />
                Prev
              </button>
              <button
                type="button"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex items-center gap-1 rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function monthOptionLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function DepartmentInsightsBlock() {
  const [month, setMonth] = useState("");
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (month) params.set("month", month);
    fetch(`/api/retention/responses/insights?${params}`, { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json.ok) {
          throw new Error(json.error || "Failed to load insights");
        }
        if (!cancelled) setData(json.data as InsightsData);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message || "Failed to load insights");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [month]);

  return (
    <section className="xxii-card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-[var(--xxii-line)] px-4 py-4 sm:flex-row sm:items-end sm:justify-between sm:px-5">
        <div>
          <h3 className="text-sm font-bold text-[var(--xxii-text)]">
            Department rating averages
          </h3>
          <p className="mt-0.5 text-xs text-[var(--xxii-muted)]">
            Overall and per-department averages from completed driver surveys.
            Low ratings (≤3★) are summarized below.
          </p>
        </div>
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
          Month
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="h-9 min-w-[160px] rounded-xl border border-[var(--xxii-line)] bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-[var(--xxii-blue)]"
          >
            <option value="">All time</option>
            {(data?.monthsAvailable || []).map((m) => (
              <option key={m} value={m}>
                {monthOptionLabel(m)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? (
        <div className="px-4 py-6 text-sm text-rose-600 sm:px-5">{error}</div>
      ) : loading && !data ? (
        <div className="grid gap-3 p-4 sm:grid-cols-5 sm:px-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      ) : data ? (
        <div className="space-y-4 p-4 sm:p-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <div className="rounded-xl border border-[var(--xxii-line)] bg-slate-50/80 px-3 py-3">
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                Total average
              </div>
              <div className="mt-1 text-2xl font-extrabold tabular-nums text-[var(--xxii-text)]">
                {data.totalAverage != null ? data.totalAverage.toFixed(1) : "—"}
                <span className="text-sm font-semibold text-slate-400">★</span>
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500">
                {data.totalRated} rated survey
                {data.totalRated === 1 ? "" : "s"}
              </div>
            </div>
            {data.departments.map((d) => (
              <div
                key={d.department}
                className="rounded-xl border border-[var(--xxii-line)] bg-white px-3 py-3"
              >
                <div className="truncate text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  {d.department}
                </div>
                <div className="mt-1 text-2xl font-extrabold tabular-nums text-[var(--xxii-text)]">
                  {d.average != null ? d.average.toFixed(1) : "—"}
                  <span className="text-sm font-semibold text-slate-400">★</span>
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500">
                  {d.count} rating{d.count === 1 ? "" : "s"}
                  {d.lowCount > 0 ? ` · ${d.lowCount} low` : ""}
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-600">
              <Sparkles size={14} className="text-[var(--xxii-blue)]" />
              Issues from low ratings / comments
              {data.aiUsed ? (
                <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-700 ring-1 ring-sky-200">
                  AI summary
                </span>
              ) : (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                  Auto summary
                </span>
              )}
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {data.departments.map((d) => (
                <div
                  key={`sum-${d.department}`}
                  className="rounded-xl border border-[var(--xxii-line)] bg-slate-50/50 p-3"
                >
                  <div className="text-sm font-bold text-[var(--xxii-text)]">
                    {d.department}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">
                    {d.summary}
                  </p>
                  {d.highlights.length ? (
                    <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-slate-700">
                      {d.highlights.map((h) => (
                        <li key={h}>{h}</li>
                      ))}
                    </ul>
                  ) : null}
                  {d.sampleComments.length ? (
                    <div className="mt-2 space-y-2 border-t border-[var(--xxii-line)] pt-2">
                      {d.sampleComments.slice(0, 2).map((c) => (
                        <div key={`${c.driverId}-${c.text.slice(0, 40)}`}>
                          {d.department === "Dispatch" || c.dispatcher ? (
                            <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                              Dispatcher:{" "}
                              <span className="text-slate-800">
                                {c.dispatcher || "Unassigned"}
                              </span>
                              {c.driverName ? (
                                <span className="font-medium normal-case tracking-normal text-slate-400">
                                  {" "}
                                  · driver {c.driverName}
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                          <p className="line-clamp-2 text-[11px] italic text-slate-500">
                            “{c.text}”
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "rounded-xl px-3 py-1.5 text-xs font-bold ring-1 transition-colors",
        active
          ? "bg-[var(--xxii-blue)] text-white ring-[var(--xxii-blue)]"
          : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
      )}
    >
      {label}
    </button>
  );
}
