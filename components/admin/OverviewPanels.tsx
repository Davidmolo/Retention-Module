"use client";

import Link from "next/link";
import { memo, useCallback } from "react";
import {
  AlertTriangle,
  Mail,
  MessageCircle,
  Send,
  SmilePlus,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { StatusPill, Stars, DepartmentRatingsCell } from "./ui";
import { prefetchDriverDetail } from "@/lib/retention/driverCache";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export type OverviewData = {
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
};

/** Static overview chrome — memoized so search/view toggles don't redraw charts. */
export const OverviewPanels = memo(function OverviewPanels({
  data,
  onAtRisk,
  onResponses,
  onPending,
}: {
  data: OverviewData;
  onAtRisk: () => void;
  onResponses?: () => void;
  onPending?: () => void;
}) {
  const maxIssue = Math.max(...data.charts.issueBreakdown.map((d) => d.count), 1);

  return (
    <div className="w-full min-w-0 max-w-full space-y-6 overflow-x-hidden">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Satisfaction Rate"
          value={
            data.kpis.satisfactionRate == null
              ? "—"
              : `${data.kpis.satisfactionRate}%`
          }
          hint="Latest driver rating ≥4 (excludes admin tests)"
          tone="good"
          icon={<SmilePlus size={18} />}
        />
        <KpiCard
          title="At Risk Drivers"
          value={String(data.kpis.atRiskCount)}
          hint="Open at-risk cases"
          tone="risk"
          icon={<AlertTriangle size={18} />}
          onClick={onAtRisk}
        />
        <KpiCard
          title="Pending Surveys"
          value={String(data.kpis.pendingSurveys)}
          hint="Sent / reminded, awaiting reply"
          tone="blue"
          icon={<Mail size={18} />}
          onClick={onPending}
        />
        <KpiCard
          title="Total Responses"
          value={String(data.kpis.totalResponses)}
          hint="Submitted + pending + no response"
          tone="purple"
          icon={<MessageCircle size={18} />}
          onClick={onResponses}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <section className="xxii-card min-w-0 overflow-hidden p-4 sm:p-5">
          <h3 className="mb-4 text-sm font-bold text-[var(--xxii-text)]">
            Driver Rating Distribution
          </h3>
          <div className="h-48 w-full min-w-0 max-w-full overflow-hidden sm:h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.charts.ratingDistribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8eef8" vertical={false} />
                <XAxis
                  dataKey="star"
                  tickFormatter={(v) => `${v}★`}
                  stroke="#94a3b8"
                  fontSize={12}
                />
                <YAxis allowDecimals={false} stroke="#94a3b8" fontSize={12} width={28} />
                <Tooltip
                  cursor={{ fill: "rgba(47,111,237,0.06)" }}
                  contentStyle={{ borderRadius: 12, borderColor: "#e4ebf5" }}
                />
                <Bar
                  dataKey="count"
                  fill="#2f6fed"
                  radius={[8, 8, 0, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="xxii-card min-w-0 overflow-hidden p-4 sm:p-5">
          <h3 className="mb-4 text-sm font-bold text-[var(--xxii-text)]">
            Survey Sent vs Response Rate
          </h3>
          <div className="h-48 w-full min-w-0 max-w-full overflow-hidden sm:h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.charts.surveyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8eef8" vertical={false} />
                <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} />
                <YAxis allowDecimals={false} stroke="#94a3b8" fontSize={12} width={28} />
                <Tooltip contentStyle={{ borderRadius: 12, borderColor: "#e4ebf5" }} />
                <Line
                  type="monotone"
                  dataKey="sent"
                  stroke="#94a3b8"
                  strokeWidth={2}
                  dot={false}
                  name="Sent"
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="responded"
                  stroke="#2f6fed"
                  strokeWidth={3}
                  dot={{ r: 3 }}
                  name="Responded"
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="xxii-card min-w-0 overflow-hidden p-4 sm:p-5 lg:col-span-2 xl:col-span-1">
          <h3 className="mb-4 text-sm font-bold text-[var(--xxii-text)]">
            Issue Breakdown (1–3★)
          </h3>
          <div className="space-y-4 pt-2">
            {data.charts.issueBreakdown.map((item) => (
              <div key={item.department}>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-600">{item.department}</span>
                  <span className="font-bold text-[var(--xxii-text)]">{item.count}</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-sky-400 to-blue-600"
                    style={{ width: `${(item.count / maxIssue) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <RecentResponses rows={data.recentResponses} onViewAll={onResponses} />
    </div>
  );
});

const RecentResponses = memo(function RecentResponses({
  rows,
  onViewAll,
}: {
  rows: OverviewData["recentResponses"];
  onViewAll?: () => void;
}) {
  const prefetch = useCallback((id: string) => {
    prefetchDriverDetail(id);
  }, []);

  return (
    <section className="xxii-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--xxii-line)] px-4 py-4 sm:px-5">
        <div>
          <h3 className="text-sm font-bold text-[var(--xxii-text)]">Recent Responses</h3>
          <p className="mt-0.5 text-xs text-[var(--xxii-muted)]">
            Latest survey submissions across the fleet
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
            {rows.length} shown
          </span>
          {onViewAll && (
            <button
              type="button"
              onClick={onViewAll}
              className="rounded-xl bg-[var(--xxii-blue-soft)] px-3 py-1.5 text-xs font-bold text-[var(--xxii-blue)] hover:bg-sky-100"
            >
              View all
            </button>
          )}
        </div>
      </div>

      <div className="space-y-3 p-3 md:hidden">
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
                <div className="font-semibold text-[var(--xxii-text)]">{row.driverName}</div>
                <div className="mt-0.5 text-xs text-[var(--xxii-muted)]">
                  {formatDate(row.date)}
                </div>
              </div>
              <StatusPill status={row.status} />
            </div>
            <Stars value={row.overallRating} size="sm" />
            <div className="mt-2">
              <DepartmentRatingsCell ratings={row.departmentRatings} />
            </div>
            <p className="mt-2 line-clamp-2 text-sm text-slate-600">{row.comment || "—"}</p>
          </Link>
        ))}
        {!rows.length && (
          <div className="py-10 text-center text-sm text-slate-400">No survey responses yet</div>
        )}
      </div>

      <div className="hidden max-w-full overflow-x-auto md:block">
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
              <tr key={row.id} className="border-t border-[var(--xxii-line)] hover:bg-sky-50/40">
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
                  <Stars value={row.overallRating} size="sm" />
                </td>
                <td className="px-5 py-3.5">
                  <DepartmentRatingsCell ratings={row.departmentRatings} />
                </td>
                <td className="px-5 py-3.5">
                  <StatusPill status={row.status} />
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
            {!rows.length && (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-slate-400">
                  No survey responses yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
});

function KpiCard({
  title,
  value,
  hint,
  tone,
  icon,
  onClick,
}: {
  title: string;
  value: string;
  hint: string;
  tone: "good" | "risk" | "blue" | "purple";
  icon: React.ReactNode;
  onClick?: () => void;
}) {
  const tones = {
    good: "from-emerald-500/15 to-emerald-500/5 text-emerald-700",
    risk: "from-rose-500/15 to-rose-500/5 text-rose-700",
    blue: "from-sky-500/15 to-sky-500/5 text-sky-700",
    purple: "from-violet-500/15 to-violet-500/5 text-violet-700",
  };

  return (
    <div
      onClick={onClick}
      className={`xxii-card relative overflow-hidden p-5 ${onClick ? "cursor-pointer" : ""}`}
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${tones[tone]} opacity-70`} />
      <div className="relative">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/80 shadow-sm">
            {icon}
          </div>
        </div>
        <div className="text-2xl font-extrabold tracking-tight sm:text-3xl">{value}</div>
        <div className="mt-1 text-sm font-semibold text-slate-700">{title}</div>
        <div className="mt-1 text-xs text-[var(--xxii-muted)]">{hint}</div>
      </div>
    </div>
  );
}
