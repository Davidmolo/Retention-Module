"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  MessageCircle,
  Send,
  SmilePlus,
  Mail,
  TrendingDown,
  TrendingUp,
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
import { StatusPill, Stars } from "./ui";

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
    status: string;
    comment: string;
  }[];
  drivers: { driverId: string; name: string; atRisk: boolean }[];
};

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.45, ease: "easeOut" as const },
  }),
};

export function RetentionDashboard({ data }: { data: Overview }) {
  const maxIssue = Math.max(...data.charts.issueBreakdown.map((d) => d.count), 1);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          index={0}
          title="Satisfaction Rate"
          value={data.kpis.satisfactionRate == null ? "—" : `${data.kpis.satisfactionRate}%`}
          hint="+8% vs last month"
          tone="good"
          icon={<SmilePlus size={18} />}
          trend="up"
        />
        <KpiCard
          index={1}
          title="At Risk Drivers"
          value={String(data.kpis.atRiskCount)}
          hint="Needs follow-up"
          tone="risk"
          icon={<AlertTriangle size={18} />}
          trend="up"
        />
        <KpiCard
          index={2}
          title="Pending Surveys"
          value={String(data.kpis.pendingSurveys)}
          hint="Awaiting response"
          tone="blue"
          icon={<Mail size={18} />}
          trend="down"
        />
        <KpiCard
          index={3}
          title="Total Responses"
          value={String(data.kpis.totalResponses)}
          hint="This month (demo seed)"
          tone="purple"
          icon={<MessageCircle size={18} />}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <motion.section
          custom={4}
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="xxii-card p-5"
        >
          <h3 className="mb-4 text-sm font-bold text-[var(--xxii-text)]">
            Driver Rating Distribution
          </h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.charts.ratingDistribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8eef8" vertical={false} />
                <XAxis dataKey="star" tickFormatter={(v) => `${v}★`} stroke="#94a3b8" fontSize={12} />
                <YAxis allowDecimals={false} stroke="#94a3b8" fontSize={12} />
                <Tooltip
                  cursor={{ fill: "rgba(47,111,237,0.06)" }}
                  contentStyle={{ borderRadius: 12, borderColor: "#e4ebf5" }}
                />
                <Bar dataKey="count" fill="#2f6fed" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.section>

        <motion.section
          custom={5}
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="xxii-card p-5"
        >
          <h3 className="mb-4 text-sm font-bold text-[var(--xxii-text)]">
            Survey Sent vs Response Rate
          </h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.charts.surveyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8eef8" vertical={false} />
                <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} />
                <YAxis allowDecimals={false} stroke="#94a3b8" fontSize={12} />
                <Tooltip contentStyle={{ borderRadius: 12, borderColor: "#e4ebf5" }} />
                <Line
                  type="monotone"
                  dataKey="sent"
                  stroke="#94a3b8"
                  strokeWidth={2}
                  dot={false}
                  name="Sent"
                />
                <Line
                  type="monotone"
                  dataKey="responded"
                  stroke="#2f6fed"
                  strokeWidth={3}
                  dot={{ r: 3 }}
                  name="Responded"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </motion.section>

        <motion.section
          custom={6}
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="xxii-card p-5"
        >
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
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(item.count / maxIssue) * 100}%` }}
                    transition={{ duration: 0.7, ease: "easeOut" }}
                    className="h-full rounded-full bg-gradient-to-r from-sky-400 to-blue-600"
                  />
                </div>
              </div>
            ))}
          </div>
        </motion.section>
      </div>

    </div>
  );
}

function KpiCard({
  title,
  value,
  hint,
  tone,
  icon,
  trend,
  index,
}: {
  title: string;
  value: string;
  hint: string;
  tone: "good" | "risk" | "blue" | "purple";
  icon: React.ReactNode;
  trend?: "up" | "down";
  index: number;
}) {
  const tones = {
    good: "from-emerald-500/15 to-emerald-500/5 text-emerald-700",
    risk: "from-rose-500/15 to-rose-500/5 text-rose-700",
    blue: "from-sky-500/15 to-sky-500/5 text-sky-700",
    purple: "from-violet-500/15 to-violet-500/5 text-violet-700",
  };

  return (
    <motion.div
      custom={index}
      variants={fadeUp}
      initial="hidden"
      animate="show"
      whileHover={{ y: -3 }}
      className="xxii-card relative overflow-hidden p-5"
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${tones[tone]} opacity-70`} />
      <div className="relative">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/80 shadow-sm">
            {icon}
          </div>
          {trend === "up" && <TrendingUp size={16} className="opacity-60" />}
          {trend === "down" && <TrendingDown size={16} className="opacity-60" />}
        </div>
        <div className="text-3xl font-extrabold tracking-tight">{value}</div>
        <div className="mt-1 text-sm font-semibold text-slate-700">{title}</div>
        <div className="mt-1 text-xs text-[var(--xxii-muted)]">{hint}</div>
      </div>
    </motion.div>
  );
}
