"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, MessageSquareWarning, Search } from "lucide-react";
import { Stars, StatusPill } from "./ui";
import { DEPARTMENTS } from "@/lib/retention/types";
import { prefetchDriverDetail } from "@/lib/retention/driverCache";
import {
  ListPagination,
  LIST_PAGE_SIZE,
  usePagedSlice,
} from "./ListPagination";
import { SkeletonReasons } from "@/components/ui/skeleton";

type NegativeItem = {
  id: string;
  responseId: string;
  driverId: string;
  driverName: string;
  dispatcher: string;
  submittedAt: string;
  overallRating: number;
  scope: string;
  rating: number;
  comment: string;
  caseStatus: string | null;
  atRisk: boolean;
};

type ReasonsData = {
  totals: {
    negativeResponses: number;
    withComments: number;
    openAtRisk: number;
    byDepartment: { department: string; count: number }[];
  };
  items: NegativeItem[];
};

type DeptFilter = "all" | "overall" | (typeof DEPARTMENTS)[number];

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function ReasonsSummaryPanel({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<ReasonsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dept, setDept] = useState<DeptFilter>("all");
  const [q, setQ] = useState("");
  const [commentsOnly, setCommentsOnly] = useState(false);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/retention/reasons", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to load");
      setData(json.data as ReasonsData);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const maxDept = useMemo(
    () => Math.max(...(data?.totals.byDepartment.map((d) => d.count) || [0]), 1),
    [data]
  );

  const filtered = useMemo(() => {
    if (!data) return [];
    const query = q.trim().toLowerCase();
    return data.items.filter((item) => {
      if (dept === "overall" && item.scope !== "overall") return false;
      if (dept !== "all" && dept !== "overall" && item.scope !== dept) {
        return false;
      }
      if (commentsOnly && !item.comment.trim()) return false;
      if (!query) return true;
      return (
        item.driverName.toLowerCase().includes(query) ||
        item.dispatcher.toLowerCase().includes(query) ||
        item.comment.toLowerCase().includes(query) ||
        item.scope.toLowerCase().includes(query)
      );
    });
  }, [data, dept, q, commentsOnly]);

  useEffect(() => {
    setPage(1);
  }, [dept, q, commentsOnly]);

  const { slice, total, totalPages, safePage, from, to } = usePagedSlice(
    filtered,
    page,
    LIST_PAGE_SIZE
  );

  useEffect(() => {
    if (safePage !== page) setPage(safePage);
  }, [safePage, page]);

  if (loading && !data) {
    return <SkeletonReasons />;
  }

  return (
    <div className="w-full min-w-0 max-w-full space-y-4 overflow-x-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--xxii-muted)]">
            Retention
          </div>
          <h2 className="mt-1 text-xl font-extrabold tracking-tight text-[var(--xxii-text)]">
            Feedback summary
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-[var(--xxii-muted)]">
            All negative driver feedback (overall or department ≤3★). Tap a row
            to open that driver’s survey history.
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700 ring-1 ring-slate-200"
        >
          Back to Overview
        </button>
      </div>

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi
          label="Negative surveys"
          value={String(data?.totals.negativeResponses ?? 0)}
          hint="Overall or any dept ≤3★"
        />
        <Kpi
          label="With written comments"
          value={String(data?.totals.withComments ?? 0)}
          hint="Drivers who explained the score"
        />
        <Kpi
          label="Open at-risk"
          value={String(data?.totals.openAtRisk ?? 0)}
          hint="Drivers still needing follow-up"
          warn
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
        <section className="xxii-card h-fit p-4 sm:p-5">
          <h3 className="mb-1 text-sm font-bold">Low scores by department</h3>
          <p className="mb-4 text-xs text-[var(--xxii-muted)]">
            Click a department to filter the list.
          </p>
          <div className="space-y-3">
            {(data?.totals.byDepartment || DEPARTMENTS.map((d) => ({ department: d, count: 0 }))).map(
              (row) => {
                const active = dept === row.department;
                const pct = Math.round((row.count / maxDept) * 100);
                return (
                  <button
                    key={row.department}
                    type="button"
                    onClick={() =>
                      setDept((prev) =>
                        prev === row.department
                          ? "all"
                          : (row.department as DeptFilter)
                      )
                    }
                    className={`w-full rounded-lg px-2 py-2 text-left transition ${
                      active ? "bg-sky-50 ring-1 ring-sky-200" : "hover:bg-slate-50"
                    }`}
                  >
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-medium text-slate-700">
                        {row.department}
                      </span>
                      <span className="font-bold">{row.count}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-400 to-rose-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </button>
                );
              }
            )}
          </div>
        </section>

        <section className="xxii-card flex min-h-0 flex-col overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-[var(--xxii-line)] px-4 py-3">
            <div className="relative min-w-[180px] flex-1">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                aria-hidden
              />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search driver, dispatcher, comment…"
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ["all", "All"],
                  ["overall", "Overall"],
                  ...DEPARTMENTS.map((d) => [d, d] as const),
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setDept(value as DeptFilter)}
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${
                    dept === value
                      ? "bg-slate-900 text-white ring-slate-900"
                      : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              <input
                type="checkbox"
                checked={commentsOnly}
                onChange={(e) => setCommentsOnly(e.target.checked)}
                className="rounded border-slate-300"
              />
              Comments only
            </label>
          </div>

          <ul className="max-h-[min(560px,55vh)] divide-y divide-[var(--xxii-line)] overflow-y-auto">
            {loading ? (
              <li className="px-4 py-10 text-center text-sm text-slate-400">
                Loading negative feedback…
              </li>
            ) : null}
            {!loading &&
              slice.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/retention/drivers/${item.driverId}?tab=Survey%20History`}
                    onMouseEnter={() => prefetchDriverDetail(item.driverId)}
                    className="block px-4 py-3.5 transition hover:bg-sky-50/50 sm:px-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-[var(--xxii-text)]">
                            {item.driverName}
                          </span>
                          <span className="text-xs text-[var(--xxii-muted)]">
                            Dispatcher: {item.dispatcher}
                          </span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                            {item.scope === "overall"
                              ? "Overall"
                              : item.scope}
                          </span>
                          <Stars value={item.rating} size="sm" />
                          <span className="text-[11px] text-slate-500">
                            Overall {item.overallRating}★ ·{" "}
                            {formatDate(item.submittedAt)}
                          </span>
                          {item.caseStatus ? (
                            <StatusPill status={item.caseStatus} />
                          ) : null}
                          {item.atRisk ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                              <AlertTriangle className="h-3 w-3" />
                              At risk
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    {item.comment ? (
                      <p className="mt-2 text-sm leading-relaxed text-slate-700">
                        “{item.comment}”
                      </p>
                    ) : (
                      <p className="mt-2 flex items-center gap-1.5 text-xs italic text-slate-400">
                        <MessageSquareWarning className="h-3.5 w-3.5" />
                        No written comment
                      </p>
                    )}
                  </Link>
                </li>
              ))}
            {!loading && !total ? (
              <li className="px-4 py-10 text-center text-sm text-slate-400">
                No negative feedback matches these filters
              </li>
            ) : null}
          </ul>
          {!loading ? (
            <ListPagination
              page={safePage}
              totalPages={totalPages}
              total={total}
              from={from}
              to={to}
              onPageChange={setPage}
            />
          ) : null}
        </section>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  warn,
}: {
  label: string;
  value: string;
  hint: string;
  warn?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-4 py-3 ${
        warn
          ? "border-amber-200 bg-amber-50/60"
          : "border-[var(--xxii-line)] bg-white"
      }`}
    >
      <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--xxii-muted)]">
        {label}
      </div>
      <div className="mt-1 text-2xl font-extrabold text-[var(--xxii-text)]">
        {value}
      </div>
      <div className="mt-0.5 text-xs text-[var(--xxii-muted)]">{hint}</div>
    </div>
  );
}
