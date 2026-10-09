"use client";

import clsx from "clsx";
import type {
  DetentionAnalytics,
  DetentionListItem,
  DetentionStatus,
} from "@/lib/detention/types";
function money(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function formatDetentionDuration(totalMins: number): string {
  const m = Math.max(0, Math.round(totalMins));
  const h = Math.floor(m / 60);
  const mins = m % 60;
  return `${h}h ${String(mins).padStart(2, "0")}m`;
}

export type BoardView = "table" | "progressive" | "pipeline" | "insights";

const PIPELINE_COLS: {
  key: string;
  label: string;
  statuses: string[];
  action?: string;
  waiting?: string;
}[] = [
  {
    key: "new",
    label: "NEW",
    statuses: ["New"],
    action: "Start the claim",
  },
  {
    key: "pending",
    label: "PENDING POD",
    statuses: ["Pending POD", "Docs Pending"],
    waiting: "Waiting on customer",
  },
  {
    key: "submitted",
    label: "POD SUBMITTED",
    statuses: ["Submitted", "Approved"],
    waiting: "Waiting on payment",
  },
  {
    key: "paid",
    label: "PAID",
    statuses: ["Paid"],
    waiting: "Paid",
  },
  {
    key: "denied",
    label: "DENIED",
    statuses: ["Denied"],
    waiting: "Denied",
  },
];

export function DetentionViewTabs({
  view,
  onChange,
}: {
  view: BoardView;
  onChange: (v: BoardView) => void;
}) {
  const tabs: { id: BoardView; label: string }[] = [
    { id: "table", label: "Table" },
    { id: "progressive", label: "Progressive" },
    { id: "pipeline", label: "Pipeline" },
    { id: "insights", label: "Insights" },
  ];
  return (
    <div
      role="tablist"
      className="inline-flex w-full flex-wrap gap-1 rounded-lg border border-border bg-slate-50 p-1 sm:w-auto"
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={view === t.id}
          onClick={() => onChange(t.id)}
          className={clsx(
            "rounded-md px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap transition",
            view === t.id
              ? "bg-white text-[var(--xxii-brand,#1e4d9c)] shadow-sm ring-1 ring-slate-200"
              : "text-slate-500 hover:text-slate-800"
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function ProgressiveStrip({
  analytics,
}: {
  analytics: DetentionAnalytics | null;
}) {
  if (!analytics) {
    return (
      <div className="h-16 animate-pulse rounded-xl bg-slate-100" />
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-slate-50 p-3">
      <div className="flex min-w-max items-stretch gap-1">
        {analytics.progressive.map((b, i) => (
          <div key={b.key} className="flex items-center gap-1">
            {i > 0 ? (
              <span className="shrink-0 px-1 text-slate-300" aria-hidden>
                →
              </span>
            ) : null}
            <div className="w-[104px] shrink-0 rounded-lg bg-white px-3 py-2.5 text-center shadow-sm ring-1 ring-slate-200">
              <div className="truncate text-[10px] font-bold uppercase tracking-wide text-slate-500">
                {b.label}
              </div>
              <div className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">
                {b.count}
              </div>
              <div className="truncate text-xs tabular-nums text-slate-500">
                {money(b.amount)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PipelineBoard({
  items,
  analytics,
  onOpen,
  onStartClaim,
}: {
  items: DetentionListItem[];
  analytics: DetentionAnalytics | null;
  onOpen: (id: string) => void;
  onStartClaim: (id: string) => void;
}) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {PIPELINE_COLS.map((col) => {
        const colItems = items.filter((i) =>
          col.statuses.includes(i.status)
        );
        const bucket = analytics?.progressive.find((p) => p.key === col.key);
        const total$ =
          bucket?.amount ??
          colItems.reduce((s, i) => s + (i.amount || 0), 0);
        return (
          <div
            key={col.key}
            className="flex w-[260px] shrink-0 flex-col rounded-xl border border-border bg-slate-50"
          >
            <div className="border-b border-border px-3 py-2">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-600">
                {col.label}
              </div>
              <div className="text-sm font-semibold tabular-nums text-slate-900">
                {money(total$)}{" "}
                <span className="font-normal text-slate-500">
                  · {colItems.length}
                </span>
              </div>
            </div>
            <div className="flex max-h-[560px] flex-col gap-2 overflow-y-auto p-2">
              {colItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onOpen(item.id)}
                  className="rounded-lg border border-border bg-white p-3 text-left shadow-sm transition hover:border-[var(--xxii-brand,#1e4d9c)]"
                >
                  <div className="truncate text-sm font-semibold text-slate-900">
                    {item.customer || "—"}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {item.loadNumber || "—"} · {item.dispatcher || "—"}
                  </div>
                  <div className="mt-1 text-sm font-semibold tabular-nums text-emerald-700">
                    {money(item.amount)}
                  </div>
                  {col.action && item.status === "New" ? (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        onStartClaim(item.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.stopPropagation();
                          onStartClaim(item.id);
                        }
                      }}
                      className="mt-2 inline-block rounded bg-rose-600 px-2 py-1 text-[11px] font-bold text-white"
                    >
                      {col.action}
                    </span>
                  ) : null}
                  {col.waiting && item.status !== "New" ? (
                    <div
                      className={clsx(
                        "mt-2 text-[11px] font-semibold",
                        item.status === "Paid"
                          ? "text-emerald-600"
                          : item.status === "Denied"
                            ? "text-rose-600"
                            : "text-sky-600"
                      )}
                    >
                      {col.waiting}
                    </div>
                  ) : null}
                </button>
              ))}
              {!colItems.length ? (
                <div className="px-2 py-6 text-center text-xs text-slate-400">
                  Empty
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BarRow({
  label,
  amount,
  count,
  max,
  tone = "sky",
}: {
  label: string;
  amount: number;
  count: number;
  max: number;
  tone?: "sky" | "amber" | "emerald" | "rose";
}) {
  const pct = max > 0 ? Math.min(100, (amount / max) * 100) : 0;
  const bg =
    tone === "amber"
      ? "bg-amber-400"
      : tone === "emerald"
        ? "bg-emerald-500"
        : tone === "rose"
          ? "bg-rose-400"
          : "bg-sky-500";
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="min-w-0 truncate font-medium text-slate-700">
          {label}
        </span>
        <span className="shrink-0 tabular-nums text-slate-500">
          {money(amount)} · {count}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className={clsx("h-full rounded-full transition-[width]", bg)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function InsightsPanel({
  analytics,
}: {
  analytics: DetentionAnalytics | null;
}) {
  if (!analytics) {
    return <div className="h-64 animate-pulse rounded-xl bg-slate-100" />;
  }
  const k = analytics.kpis;
  const maxMonth = Math.max(
    1,
    ...analytics.byMonth.map((m) => Math.max(m.billed, m.received))
  );
  const maxAge = Math.max(1, ...analytics.ageing.map((a) => a.amount));
  const maxStatus = Math.max(1, ...analytics.byStatus.map((s) => s.amount));

  const hasMonths = analytics.byMonth.length > 0;

  return (
    <div className="space-y-5">
      <div className="xxii-card px-4 py-3 sm:px-5">
        <h2 className="text-base font-semibold text-slate-900 sm:text-lg">
          Detention performance
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Last {analytics.days || "all"} days · {k.billedCount} detentions in
          window · avg {formatDetentionDuration(k.avgDetentionMins)} · success{" "}
          {k.successRate}%
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Money by week/month/dispatcher lives on Summary. This view keeps charts
          Art’s app has that Summary does not.
        </p>
      </div>

      <div className="xxii-card p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-800">
            Billed vs received by month
          </h3>
          <div className="flex items-center gap-3 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-[var(--xxii-brand,#1e4d9c)]" />
              Billed
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
              Received
            </span>
          </div>
        </div>
        {!hasMonths ? (
          <div className="flex h-48 items-center justify-center text-sm text-slate-400">
            No monthly data in this window yet.
          </div>
        ) : (
          <div className="flex h-52 items-end gap-2 border-b border-slate-100 pb-1">
            {analytics.byMonth.map((m) => {
              const billedH = m.billed ? Math.max(4, (m.billed / maxMonth) * 100) : 0;
              const recvH = m.received
                ? Math.max(4, (m.received / maxMonth) * 100)
                : 0;
              return (
                <div
                  key={m.key}
                  className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
                  title={`${m.label}: billed ${money(m.billed)}, received ${money(m.received)}`}
                >
                  <div className="flex h-44 w-full items-end justify-center gap-1">
                    <div
                      className="w-[42%] max-w-[18px] rounded-t bg-[var(--xxii-brand,#1e4d9c)]"
                      style={{ height: `${billedH}%` }}
                    />
                    <div
                      className="w-[42%] max-w-[18px] rounded-t bg-emerald-500"
                      style={{ height: `${recvH}%` }}
                    />
                  </div>
                  <div className="w-full truncate text-center text-[10px] font-medium text-slate-500">
                    {m.label}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-3 text-xs text-slate-500">
          Gap between bars = money billed but not yet collected.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="xxii-card space-y-3 p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-slate-800">
            Ageing of unsettled detentions
          </h3>
          {analytics.ageing.every((a) => a.count === 0) ? (
            <p className="py-6 text-center text-sm text-slate-400">
              No unsettled detentions in window.
            </p>
          ) : (
            analytics.ageing.map((a) => (
              <BarRow
                key={a.key}
                label={a.label}
                amount={a.amount}
                count={a.count}
                max={maxAge}
                tone={
                  a.key === "15-30" || a.key.startsWith("31") || a.key === "60+"
                    ? "amber"
                    : "emerald"
                }
              />
            ))
          )}
        </div>
        <div className="xxii-card space-y-3 p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-slate-800">
            Where detentions sit
          </h3>
          {analytics.byStatus.every((s) => s.count === 0) ? (
            <p className="py-6 text-center text-sm text-slate-400">
              No status data in window.
            </p>
          ) : (
            analytics.byStatus.map((s) => (
              <BarRow
                key={s.key}
                label={s.label}
                amount={s.amount}
                count={s.count}
                max={maxStatus}
                tone={
                  s.key === "Paid"
                    ? "emerald"
                    : s.key === "Denied"
                      ? "rose"
                      : "amber"
                }
              />
            ))
          )}
        </div>
      </div>

      <PartyTable
        title="Customers by detention billed"
        rows={analytics.byCustomer}
      />
    </div>
  );
}

function PartyTable({
  title,
  rows,
}: {
  title: string;
  rows: DetentionAnalytics["byCustomer"];
}) {
  return (
    <div className="xxii-card overflow-hidden">
      <div className="border-b border-border px-4 py-3 text-sm font-semibold">
        {title}
      </div>
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
    </div>
  );
}

export function mapsRouteUrl(pu: string | null, del: string | null): string | null {
  if (!pu?.trim() && !del?.trim()) return null;
  const origin = encodeURIComponent(pu || "");
  const destination = encodeURIComponent(del || "");
  return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`;
}

export function buildEmailClipboard(d: {
  customer?: string | null;
  loadNumber?: string | null;
  shipmentNumber?: string | null;
  driverName?: string | null;
  truckNumber?: string | null;
  dispatcher?: string | null;
  amount?: number | null;
  detentionTimeLabel?: string | null;
  detentionMins?: number | null;
  puLocation?: string | null;
  delLocation?: string | null;
  status?: string;
}): string {
  const time =
    d.detentionTimeLabel ||
    (d.detentionMins != null ? `${d.detentionMins} min` : "—");
  return [
    `Detention — Load ${d.loadNumber || "—"}`,
    `Customer: ${d.customer || "—"}`,
    `Dispatcher: ${d.dispatcher || "—"}`,
    `Driver: ${d.driverName || "—"} · Truck ${d.truckNumber || "—"}`,
    `Shipment: ${d.shipmentNumber || "—"}`,
    `PU: ${d.puLocation || "—"}`,
    `DEL: ${d.delLocation || "—"}`,
    `Time: ${time}`,
    `Amount: ${money(d.amount)}`,
    `Status: ${d.status || "—"}`,
  ].join("\n");
}

export type { DetentionStatus };
