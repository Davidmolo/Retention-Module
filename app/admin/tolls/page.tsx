'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigation } from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { weekOf } from '@/lib/week';

interface TollRow {
  tollId: number;
  vehicleNumber: string | null;
  exitDate: string | null;
  postDate: string | null;
  agency: string | null;
  agencyState: string | null;
  plaza: string | null;
  tollClass: string | null;
  category: string | null;
  charge: number | null;
  deviceNumber: string | null;
  truckId: number | null;
}

interface TollsResponse {
  year: number;
  week: number;
  start: string;
  end: string;
  page: number;
  pageSize: number;
  count: number;
  totalCharge: number;
  transactions: TollRow[];
}

const PAGE_SIZE = 50;

function previousWeek() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 7);
  return weekOf(d);
}

function maxCompletedWeekForYear(year: number): number {
  const done = previousWeek();
  if (year < done.year) return 52;
  if (year > done.year) return 0;
  return done.week;
}

function money(n: number): string {
  return `$${n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function shortDate(s: string | null): string {
  if (!s) return '—';
  return s.slice(0, 10);
}

export default function TollsPage() {
  const [selectedYear, setSelectedYear] = useState(() =>
    String(previousWeek().year)
  );
  const [selectedWeek, setSelectedWeek] = useState(() =>
    String(previousWeek().week)
  );
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [data, setData] = useState<TollsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [syncMsg, setSyncMsg] = useState('');

  const maxWeek = maxCompletedWeekForYear(Number(selectedYear));
  const weekOptions = useMemo(
    () => Array.from({ length: maxWeek }, (_, i) => i + 1),
    [maxWeek]
  );

  useEffect(() => {
    if (maxWeek > 0 && Number(selectedWeek) > maxWeek) {
      setSelectedWeek(String(maxWeek));
    }
  }, [maxWeek, selectedWeek]);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        year: selectedYear,
        week: selectedWeek,
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
      const res = await fetch(`/api/tolls?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch');
      setData(await res.json());
    } catch (err) {
      console.error('[tolls] load failed:', err);
      setError('Failed to load toll transactions');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [selectedYear, selectedWeek, page, debouncedSearch]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncMsg('');
    setError('');
    try {
      const res = await fetch('/api/tolls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: Number(selectedYear),
          week: Number(selectedWeek),
        }),
      });
      if (!res.ok) throw new Error('Sync failed');
      const result = await res.json();
      setSyncMsg(
        `Synced ${result.fetched ?? 0} from PrePass (${result.stored ?? 0} stored).`
      );
      if (page !== 1) {
        setPage(1);
      } else {
        await load();
      }
    } catch (err) {
      console.error('[tolls] sync failed:', err);
      setError('Failed to sync toll transactions from PrePass');
    } finally {
      setSyncing(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil((data?.count ?? 0) / PAGE_SIZE));

  return (
    <div className="min-h-screen bg-background md:pl-60 pt-14 md:pt-0">
      <Navigation currentPage="tolls" />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex justify-between items-start gap-4 mb-8 flex-col lg:flex-row">
          <div>
            <h1 className="text-4xl font-bold text-foreground mb-2">
              Toll Transactions
            </h1>
            <p className="text-muted-foreground mb-4">
              PrePass tolls for each business week (Tue–Mon), by exit date.
            </p>
            <div className="flex flex-wrap gap-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">
                  Year
                </label>
                <select
                  value={selectedYear}
                  onChange={(e) => {
                    setSelectedYear(e.target.value);
                    setPage(1);
                  }}
                  className="px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  {[2024, 2025, 2026, 2027].map((year) => (
                    <option key={year} value={String(year)}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">
                  Week
                </label>
                <select
                  value={selectedWeek}
                  onChange={(e) => {
                    setSelectedWeek(e.target.value);
                    setPage(1);
                  }}
                  className="px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  {weekOptions.map((week) => (
                    <option key={week} value={String(week)}>
                      Week {week}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">
                  Vehicle
                </label>
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter unit…"
                  className="px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 w-40"
                />
              </div>
            </div>
          </div>
          <Button onClick={handleSync} disabled={syncing || loading} size="lg">
            {syncing ? 'Syncing…' : 'Sync this week'}
          </Button>
        </div>

        {syncMsg ? (
          <p className="text-sm text-muted-foreground mb-4">{syncMsg}</p>
        ) : null}

        {error ? (
          <p className="text-destructive mb-4">{error}</p>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <SummaryCard
            title="Period"
            value={
              data
                ? `Week ${data.week}`
                : `Week ${selectedWeek}`
            }
            subtitle={
              data ? `${data.start} → ${data.end}` : 'Reporting week'
            }
          />
          <SummaryCard
            title="Transactions"
            value={loading && !data ? '…' : String(data?.count ?? 0)}
            subtitle="toll rows this week"
          />
          <SummaryCard
            title="Total charge"
            value={
              loading && !data
                ? '…'
                : money(data?.totalCharge ?? 0)
            }
            subtitle="sum of toll_charge"
          />
        </div>

        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">
                    Exit date
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">
                    Post date
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">
                    Vehicle
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">
                    Plaza
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">
                    Agency
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">
                    Class
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground">
                    Charge
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading && !data ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-12 text-center text-muted-foreground"
                    >
                      Loading…
                    </td>
                  </tr>
                ) : !data || data.transactions.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-12 text-center text-muted-foreground"
                    >
                      No toll transactions for this week. Try Sync this week.
                    </td>
                  </tr>
                ) : (
                  data.transactions.map((t, idx) => (
                    <tr
                      key={t.tollId}
                      className={
                        idx % 2 === 0 ? 'bg-background' : 'bg-muted/40'
                      }
                    >
                      <td className="px-4 py-3 tabular-nums">
                        {shortDate(t.exitDate)}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {shortDate(t.postDate)}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {t.vehicleNumber ?? '—'}
                      </td>
                      <td className="px-4 py-3 max-w-[220px] truncate" title={t.plaza ?? undefined}>
                        {t.plaza ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        {t.agency
                          ? t.agencyState
                            ? `${t.agency} (${t.agencyState})`
                            : t.agency
                          : t.agencyState ?? '—'}
                      </td>
                      <td className="px-4 py-3">{t.tollClass ?? '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium">
                        {t.charge == null ? '—' : money(t.charge)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {data && data.count > 0 ? (
            <div className="flex items-center justify-between gap-4 px-4 py-3 border-t border-border text-sm">
              <p className="text-muted-foreground">
                Page {page} of {totalPages} · {data.count} total
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle: string;
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <p className="text-xs font-medium text-muted-foreground mb-1">{title}</p>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
    </div>
  );
}
