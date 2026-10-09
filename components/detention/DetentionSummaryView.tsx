"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, Search } from "lucide-react";
import type {
  DetentionDispatcherSummary,
  DetentionPeriodSummary,
} from "@/lib/detention/types";

function money(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function SummaryTable({
  title,
  rows,
  submittedHint,
  collectedHint,
  weekLimitNote,
}: {
  title: string;
  rows: DetentionPeriodSummary[];
  submittedHint: string;
  collectedHint: string;
  weekLimitNote?: string;
}) {
  return (
    <div className="xxii-card overflow-hidden">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Submitted = claims received in the period. Collected = paid amount on
          those same claims.
        </p>
        {weekLimitNote ? (
          <p className="mt-1 text-xs text-muted-foreground">{weekLimitNote}</p>
        ) : null}
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
                <th className="px-4 py-3 font-medium">Period</th>
                <th className="px-4 py-3 font-medium" title={submittedHint}>
                  Submitted
                </th>
                <th className="px-4 py-3 font-medium" title={submittedHint}>
                  Submitted amount
                </th>
                <th className="px-4 py-3 font-medium">Paid</th>
                <th className="px-4 py-3 font-medium" title={collectedHint}>
                  Collected
                </th>
                <th className="px-4 py-3 font-medium">Still open</th>
                <th className="px-4 py-3 font-medium">Open $</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.key} className="hover:bg-slate-50/80">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <div>{r.label}</div>
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

function DispatcherTable({ rows }: { rows: DetentionDispatcherSummary[] }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => r.dispatcher.toLowerCase().includes(needle));
  }, [rows, q]);

  return (
    <div className="xxii-card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            By dispatcher
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Detention claims received and total amount collected by dispatcher.
          </p>
        </div>
        {rows.length ? (
          <div className="relative w-full sm:w-64">
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
          <table className="w-full min-w-[780px] table-fixed text-left text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Dispatcher</th>
                <th className="px-4 py-3 font-medium">Submitted</th>
                <th className="px-4 py-3 font-medium">Submitted amount</th>
                <th className="px-4 py-3 font-medium">Paid</th>
                <th className="px-4 py-3 font-medium">Collected</th>
                <th className="px-4 py-3 font-medium">Collection %</th>
                <th className="px-4 py-3 font-medium">Still open</th>
                <th className="px-4 py-3 font-medium">Open $</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r) => (
                <tr key={r.dispatcher} className="hover:bg-slate-50/80">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {r.dispatcher}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{r.submitted}</td>
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/detention/summary", {
          credentials: "include",
        });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          throw new Error(json.error || "Failed to load summary");
        }
        if (cancelled) return;
        setWeeks(json.data.weeks || []);
        setMonths(json.data.months || []);
        setDispatchers(json.data.dispatchers || []);
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

      {error ? (
        <div className="flex items-center gap-2 text-sm text-rose-600">
          <AlertCircle size={16} />
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      ) : (
        <>
          <SummaryTable
            title="By week"
            rows={weeks}
            submittedHint="Total claims received during each period listed below."
            collectedHint="Total amount collected for those claims."
            weekLimitNote="Shows the latest 26 Tuesday–Monday weeks (W##, same as Gross Profit). When a newer week appears, the oldest drops off the list."
          />
          <SummaryTable
            title="By month"
            rows={months}
            submittedHint="Total claims received during each month listed below."
            collectedHint="Total amount collected for those claims."
          />
          <DispatcherTable rows={dispatchers} />
        </>
      )}
    </div>
  );
}
