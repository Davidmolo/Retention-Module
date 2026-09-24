"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, startTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Filter, Search, Users } from "lucide-react";
import { StatusPill, Stars, DepartmentRatingsCell } from "./ui";
import {
  navigateRetentionView,
  parseResponsesFilter,
  parseRetentionView,
  retentionViewPath,
  RETENTION_VIEW_EVENT,
  type ResponsesFilter,
  type RetentionView,
} from "@/lib/retention/viewNav";
import { prefetchDriverDetail } from "@/lib/retention/driverCache";
import { OverviewPanels } from "./OverviewPanels";
import { ResponsesPanel } from "./ResponsesPanel";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type DriverRow = {
  driverId: string;
  name: string;
  avatarInitials: string;
  driverTypeLabel: string;
  dispatcher: string;
  latestOverallRating: number | null;
  latestComment: string;
  latestSurveyAt: string | null;
  atRisk: boolean;
  caseStatus: string | null;
  nonResponse: boolean;
  repeatedLowRatings?: boolean;
  focusDepartment: string | null;
  departmentRatings?: { department: string; rating: number }[];
  responseCount: number;
};

type Overview = {
  kpis: {
    satisfactionRate: number | null;
    atRiskCount: number;
    pendingSurveys: number;
    totalResponses: number;
  };
  charts: {
    ratingDistribution: { star: number; count: number }[];
    issueBreakdown: { department: string; count: number }[];
    surveyTrend: { label: string; sent: number; responded: number }[];
  };
  recentResponses: {
    id: string;
    date: string;
    driverId: string;
    driverName: string;
    overallRating: number;
    department: string | null;
    departmentRatings?: { department: string; rating: number }[];
    status: string;
    comment: string;
  }[];
  drivers: DriverRow[];
};

type ViewKey = RetentionView;

export function RetentionDashboard({
  data,
  initialView = "overview",
}: {
  data: Overview;
  initialView?: ViewKey;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString() ? `?${searchParams.toString()}` : "";
  const urlView = parseRetentionView(search);
  const urlResponsesFilter = parseResponsesFilter(search);
  const [view, setViewLocal] = useState<ViewKey>(initialView || urlView);
  const [responsesFilter, setResponsesFilter] =
    useState<ResponsesFilter>(urlResponsesFilter);
  const riskOnly = view === "at-risk";

  // Keep view in sync when sidebar Links change ?view= (Next soft nav does not remount).
  useEffect(() => {
    setViewLocal(urlView);
    setResponsesFilter(urlResponsesFilter);
  }, [urlView, urlResponsesFilter]);

  useEffect(() => {
    const syncFromUrl = () => {
      setViewLocal(parseRetentionView(window.location.search));
      setResponsesFilter(parseResponsesFilter(window.location.search));
    };
    const onView = (e: Event) => {
      const next = (e as CustomEvent<RetentionView>).detail;
      if (next) {
        setViewLocal(next);
        setResponsesFilter(parseResponsesFilter(window.location.search));
      }
    };
    window.addEventListener("popstate", syncFromUrl);
    window.addEventListener(RETENTION_VIEW_EVENT, onView);
    return () => {
      window.removeEventListener("popstate", syncFromUrl);
      window.removeEventListener(RETENTION_VIEW_EVENT, onView);
    };
  }, []);

  const setView = useCallback(
    (next: ViewKey, extra?: { filter?: ResponsesFilter }) => {
      if (pathname !== "/retention") {
        router.push(retentionViewPath(next, extra));
        return;
      }
      startTransition(() => {
        setViewLocal(next);
        if (next === "responses") {
          setResponsesFilter(
            extra?.filter === "pending" ||
              extra?.filter === "completed" ||
              extra?.filter === "non_response"
              ? extra.filter
              : "all"
          );
        }
        navigateRetentionView(next, extra);
      });
    },
    [pathname, router]
  );

  const goAtRisk = useCallback(() => setView("at-risk"), [setView]);
  const goOverview = useCallback(() => setView("overview"), [setView]);
  const goResponses = useCallback(
    () => setView("responses", { filter: "all" }),
    [setView]
  );
  const goPending = useCallback(
    () => setView("responses", { filter: "pending" }),
    [setView]
  );

  if (view === "responses") {
    return (
      <ResponsesPanel
        initialFilter={responsesFilter}
        onBack={goOverview}
      />
    );
  }

  if (view === "follow-ups" || view === "exit" || view === "reasons") {
    return (
      <SecondaryView
        view={view}
        data={data}
        onBack={goOverview}
        onOpenAtRisk={goAtRisk}
      />
    );
  }

  return (
    <div className="w-full min-w-0 max-w-full overflow-x-hidden">
      <div
        className={
          riskOnly ? "hidden" : "w-full min-w-0 max-w-full space-y-6 overflow-x-hidden"
        }
        aria-hidden={riskOnly}
      >
        <OverviewPanels
          data={data}
          onAtRisk={goAtRisk}
          onResponses={goResponses}
          onPending={goPending}
        />
      </div>

      {riskOnly && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.14em] text-rose-600">
              Retention · At Risk
            </div>
            <h2 className="mt-1 text-xl font-extrabold tracking-tight text-[var(--xxii-text)]">
              Drivers needing follow-up
            </h2>
          </div>
          <button
            type="button"
            onClick={goOverview}
            className="rounded-xl bg-[var(--xxii-blue)] px-4 py-2 text-sm font-bold text-white"
          >
            Back to Overview
          </button>
        </div>
      )}

      <DriverListPanel
        drivers={data.drivers}
        riskOnly={riskOnly}
        onSetView={setView}
      />
    </div>
  );
}

function DriverListPanel({
  drivers,
  riskOnly,
  onSetView,
}: {
  drivers: DriverRow[];
  riskOnly: boolean;
  onSetView: (v: ViewKey) => void;
}) {
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(40);

  const filteredDrivers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return drivers.filter((d) => {
      if (riskOnly && !d.atRisk) return false;
      if (!q) return true;
      return (
        d.name.toLowerCase().includes(q) ||
        d.driverId.toLowerCase().includes(q) ||
        d.dispatcher.toLowerCase().includes(q) ||
        (d.focusDepartment || "").toLowerCase().includes(q) ||
        (d.departmentRatings || []).some(
          (r) =>
            r.department.toLowerCase().includes(q) ||
            String(r.rating).includes(q)
        )
      );
    });
  }, [drivers, query, riskOnly]);

  useEffect(() => {
    setVisibleCount(40);
  }, [query, riskOnly]);

  const visibleDrivers = useMemo(
    () => filteredDrivers.slice(0, visibleCount),
    [filteredDrivers, visibleCount]
  );
  const hasMore = visibleDrivers.length < filteredDrivers.length;

  return (
    <section
      id="at-risk-drivers"
      className="xxii-card scroll-mt-24 overflow-hidden ring-offset-2 [content-visibility:auto]"
    >
      <div className="flex flex-col gap-3 border-b border-[var(--xxii-line)] px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          {riskOnly ? (
            <AlertTriangle size={16} className="shrink-0 text-rose-600" />
          ) : (
            <Users size={16} className="shrink-0 text-[var(--xxii-blue)]" />
          )}
          <div>
            <h3 className="text-sm font-bold text-[var(--xxii-text)]">
              {riskOnly ? "At Risk Drivers" : "Driver Retention List"}
            </h3>
            <p className="mt-0.5 text-xs text-[var(--xxii-muted)]">
              Showing {visibleDrivers.length} of {filteredDrivers.length}
              {riskOnly ? " flagged for follow-up" : " from live roster"}
            </p>
          </div>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
          <label className="relative block min-w-0 flex-1 lg:w-56">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search drivers…"
              className="w-full rounded-xl border border-[var(--xxii-line)] bg-white py-2 pl-8 pr-3 text-sm outline-none focus:border-[var(--xxii-blue)]"
            />
          </label>
          {riskOnly ? (
            <button
              type="button"
              onClick={() => onSetView("overview")}
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-200"
            >
              Back to Overview
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onSetView("at-risk")}
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            >
              <Filter size={13} />
              At Risk only
            </button>
          )}
        </div>
      </div>

      <div className="space-y-3 p-3 md:hidden">
        {visibleDrivers.map((d) => (
          <Link
            key={d.driverId}
            href={`/retention/drivers/${d.driverId}`}
            onMouseEnter={() => prefetchDriverDetail(d.driverId)}
            onFocus={() => prefetchDriverDetail(d.driverId)}
            className="flex items-start gap-3 rounded-xl border border-[var(--xxii-line)] bg-white p-3.5 hover:border-sky-200 hover:bg-sky-50/40"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-blue-700 text-[11px] font-extrabold text-white">
              {d.avatarInitials}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-[var(--xxii-text)]">{d.name}</span>
                {d.atRisk ? (
                  <span className="status-pill status-open">At Risk</span>
                ) : d.caseStatus ? (
                  <StatusPill status={d.caseStatus} />
                ) : null}
              </div>
              <div className="mt-0.5 text-xs text-[var(--xxii-muted)]">
                {d.driverTypeLabel} · {d.dispatcher}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                {d.latestOverallRating != null ? (
                  <Stars value={d.latestOverallRating} size="sm" />
                ) : (
                  <span className="text-slate-400">No rating</span>
                )}
                <span>{d.latestSurveyAt ? formatDate(d.latestSurveyAt) : "No survey"}</span>
              </div>
              <div className="mt-2">
                <DepartmentRatingsCell ratings={d.departmentRatings} />
              </div>
            </div>
          </Link>
        ))}
        {!visibleDrivers.length && (
          <div className="py-10 text-center text-sm text-slate-400">
            No drivers match this filter
          </div>
        )}
      </div>

      <div className="hidden max-w-full overflow-x-auto md:block">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-slate-50/80 text-[11px] uppercase tracking-wide text-[var(--xxii-muted)]">
            <tr>
              <th className="px-5 py-3 text-left font-bold">Driver</th>
              <th className="px-5 py-3 text-left font-bold">Type</th>
              <th className="px-5 py-3 text-left font-bold">Latest rating</th>
              <th className="px-5 py-3 text-left font-bold">Departments</th>
              <th className="px-5 py-3 text-left font-bold">Last survey</th>
              <th className="px-5 py-3 text-left font-bold">Case</th>
              <th className="px-5 py-3 text-right font-bold">Action</th>
            </tr>
          </thead>
          <tbody>
            {visibleDrivers.map((d) => (
              <tr
                key={d.driverId}
                className="border-t border-[var(--xxii-line)] hover:bg-sky-50/40"
              >
                <td className="px-5 py-3.5">
                  <Link
                    href={`/retention/drivers/${d.driverId}`}
                    onMouseEnter={() => prefetchDriverDetail(d.driverId)}
                    onFocus={() => prefetchDriverDetail(d.driverId)}
                    className="flex items-center gap-3"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-blue-700 text-[11px] font-extrabold text-white">
                      {d.avatarInitials}
                    </span>
                    <span>
                      <span className="block font-semibold text-[var(--xxii-text)] hover:text-[var(--xxii-blue)]">
                        {d.name}
                      </span>
                      <span className="text-xs text-[var(--xxii-muted)]">
                        {d.dispatcher}
                        {d.nonResponse ? " · Non-response" : ""}
                        {d.repeatedLowRatings ? " · Repeated low" : ""}
                      </span>
                    </span>
                  </Link>
                </td>
                <td className="px-5 py-3.5 text-slate-600">{d.driverTypeLabel}</td>
                <td className="px-5 py-3.5">
                  {d.latestOverallRating == null ? (
                    <span className="text-slate-400">—</span>
                  ) : (
                    <Stars value={d.latestOverallRating} size="sm" />
                  )}
                </td>
                <td className="px-5 py-3.5">
                  <DepartmentRatingsCell ratings={d.departmentRatings} />
                </td>
                <td className="whitespace-nowrap px-5 py-3.5 text-slate-600">
                  {d.latestSurveyAt ? formatDate(d.latestSurveyAt) : "—"}
                </td>
                <td className="px-5 py-3.5">
                  {d.atRisk ? (
                    <span className="status-pill status-open">At Risk</span>
                  ) : (
                    <StatusPill status={d.caseStatus} />
                  )}
                </td>
                <td className="px-5 py-3.5 text-right">
                  <Link
                    href={`/retention/drivers/${d.driverId}`}
                    onMouseEnter={() => prefetchDriverDetail(d.driverId)}
                    onFocus={() => prefetchDriverDetail(d.driverId)}
                    className="inline-flex rounded-lg bg-[var(--xxii-blue-soft)] px-2.5 py-1.5 text-xs font-bold text-[var(--xxii-blue)] hover:bg-sky-100"
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
            {!visibleDrivers.length && (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-slate-400">
                  No drivers match this filter
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div className="border-t border-[var(--xxii-line)] p-4 text-center">
          <button
            type="button"
            onClick={() => setVisibleCount((n) => n + 40)}
            className="rounded-xl bg-muted px-4 py-2 text-sm font-bold text-foreground hover:bg-muted/80"
          >
            Load more ({filteredDrivers.length - visibleDrivers.length} remaining)
          </button>
        </div>
      )}
    </section>
  );
}

function SecondaryView({
  view,
  data,
  onBack,
  onOpenAtRisk,
}: {
  view: "follow-ups" | "exit" | "reasons";
  data: Overview;
  onBack: () => void;
  onOpenAtRisk: () => void;
}) {
  const followUps = useMemo(
    () =>
      data.drivers.filter(
        (d) =>
          d.caseStatus === "In Progress" ||
          d.caseStatus === "Open" ||
          d.atRisk
      ),
    [data.drivers]
  );

  const resolved = useMemo(
    () =>
      data.drivers.filter(
        (d) => d.caseStatus === "Resolved" || d.caseStatus === "Completed"
      ),
    [data.drivers]
  );

  const reasonRows = useMemo(() => {
    const max = Math.max(...data.charts.issueBreakdown.map((d) => d.count), 1);
    return data.charts.issueBreakdown.map((row) => ({
      ...row,
      pct: Math.round((row.count / max) * 100),
    }));
  }, [data.charts.issueBreakdown]);

  const lowComments = useMemo(
    () =>
      data.recentResponses.filter((r) => r.overallRating <= 3 && r.comment),
    [data.recentResponses]
  );

  const title =
    view === "follow-ups"
      ? "Follow-ups"
      : view === "exit"
        ? "Exit / Turnover"
        : "Reasons";

  return (
    <div className="w-full min-w-0 max-w-full space-y-4 overflow-x-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--xxii-muted)]">
            Retention
          </div>
          <h2 className="mt-1 text-xl font-extrabold tracking-tight text-[var(--xxii-text)]">
            {title}
          </h2>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700 ring-1 ring-slate-200"
        >
          Back to Overview
        </button>
      </div>

      {view === "follow-ups" && (
        <section className="xxii-card overflow-hidden">
          <div className="border-b border-[var(--xxii-line)] px-4 py-3 sm:px-5">
            <p className="text-sm text-[var(--xxii-muted)]">
              Open and in-progress at-risk cases that need a staff check-in.
            </p>
          </div>
          <ul className="divide-y divide-[var(--xxii-line)]">
            {followUps.map((d) => (
              <li key={d.driverId}>
                <Link
                  href={`/retention/drivers/${d.driverId}`}
                  onMouseEnter={() => prefetchDriverDetail(d.driverId)}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3.5 hover:bg-sky-50/40 sm:px-5"
                >
                  <div>
                    <div className="font-semibold text-[var(--xxii-text)]">{d.name}</div>
                    <div className="text-xs text-[var(--xxii-muted)]">
                      {d.dispatcher}
                    </div>
                    <div className="mt-1">
                      <DepartmentRatingsCell ratings={d.departmentRatings} />
                    </div>
                  </div>
                  <StatusPill status={d.caseStatus || (d.atRisk ? "Open" : null)} />
                </Link>
              </li>
            ))}
            {!followUps.length && (
              <li className="px-5 py-10 text-center text-sm text-slate-400">
                No open follow-ups right now
              </li>
            )}
          </ul>
          <div className="border-t border-[var(--xxii-line)] px-4 py-3 sm:px-5">
            <button
              type="button"
              onClick={onOpenAtRisk}
              className="text-sm font-bold text-[var(--xxii-blue)]"
            >
              View At Risk list →
            </button>
          </div>
        </section>
      )}

      {view === "exit" && (
        <section className="xxii-card overflow-hidden">
          <div className="border-b border-[var(--xxii-line)] px-4 py-3 sm:px-5">
            <p className="text-sm text-[var(--xxii-muted)]">
              Drivers whose retention cases are resolved or completed.
            </p>
          </div>
          <ul className="divide-y divide-[var(--xxii-line)]">
            {resolved.map((d) => (
              <li key={d.driverId}>
                <Link
                  href={`/retention/drivers/${d.driverId}`}
                  onMouseEnter={() => prefetchDriverDetail(d.driverId)}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3.5 hover:bg-sky-50/40 sm:px-5"
                >
                  <div>
                    <div className="font-semibold text-[var(--xxii-text)]">{d.name}</div>
                    <div className="text-xs text-[var(--xxii-muted)]">{d.dispatcher}</div>
                  </div>
                  <StatusPill status={d.caseStatus} />
                </Link>
              </li>
            ))}
            {!resolved.length && (
              <li className="px-5 py-10 text-center text-sm text-slate-400">
                No resolved cases yet
              </li>
            )}
          </ul>
        </section>
      )}

      {view === "reasons" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="xxii-card p-4 sm:p-5">
            <h3 className="mb-4 text-sm font-bold">Low ratings by department</h3>
            <p className="mb-4 text-xs text-[var(--xxii-muted)]">
              From submitted driver surveys (department ratings ≤3).
            </p>
            <div className="space-y-3">
              {reasonRows.map((row) => (
                <div key={row.department}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="font-medium text-slate-600">{row.department}</span>
                    <span className="font-bold">{row.count}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-sky-400 to-blue-600"
                      style={{ width: `${row.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section className="xxii-card overflow-hidden">
            <div className="border-b border-[var(--xxii-line)] px-4 py-3">
              <h3 className="text-sm font-bold">Recent low-rating comments</h3>
            </div>
            <ul className="divide-y divide-[var(--xxii-line)]">
              {lowComments.map((r) => (
                <li key={r.id} className="px-4 py-3">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Link
                      href={`/retention/drivers/${r.driverId}`}
                      className="text-sm font-semibold text-[var(--xxii-blue)]"
                    >
                      {r.driverName}
                    </Link>
                    <Stars value={r.overallRating} size="sm" />
                    {r.department && (
                      <span className="text-xs text-[var(--xxii-muted)]">{r.department}</span>
                    )}
                  </div>
                  <p className="text-sm text-slate-600">{r.comment}</p>
                </li>
              ))}
              {!lowComments.length && (
                <li className="px-4 py-10 text-center text-sm text-slate-400">
                  No low-rating comments in recent responses
                </li>
              )}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
