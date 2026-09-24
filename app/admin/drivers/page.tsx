'use client';

import { useCallback, useEffect, useState } from 'react';
import { Navigation } from '@/components/Navigation';
import { Button } from '@/components/ui/button';

interface Driver {
  id: number;
  name: string;
  driverNr: string | null;
  status: string | null;
  driverType: string | null;
  phone: string | null;
  email: string | null;
}

const PAGE_SIZE = 25;

export default function DriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState('active');
  const [statuses, setStatuses] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
      if (status) params.set('status', status);
      const res = await fetch(`/api/drivers?${params.toString()}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setDrivers(data.drivers ?? []);
      setTotal(data.total ?? 0);
      if (Array.isArray(data.statuses)) setStatuses(data.statuses);
      setError('');
    } catch {
      setError('Failed to load drivers');
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, status]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (error) {
    return (
      <div className="min-h-screen bg-background md:pl-60 pt-14 md:pt-0">
        <Navigation currentPage="drivers" />
        <div className="flex items-center justify-center h-96">
          <p className="text-destructive">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background md:pl-60 pt-14 md:pt-0">
      <Navigation currentPage="drivers" />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold text-foreground">Drivers</h1>
          <span className="text-sm text-muted-foreground">
            {total} drivers · from TMS
          </span>
        </div>

        <div className="flex flex-wrap gap-3 mb-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or driver #…"
            className="flex-1 min-w-[16rem] max-w-md px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Name</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Driver #</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Type</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Phone</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Email</th>
                </tr>
              </thead>
              <tbody>
                {loading && drivers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                      Loading…
                    </td>
                  </tr>
                ) : drivers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                      No drivers found
                    </td>
                  </tr>
                ) : (
                  drivers.map((d, idx) => (
                    <tr key={d.id} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted'}>
                      <td className="px-4 py-2 font-medium text-card-foreground">{d.name}</td>
                      <td className="px-4 py-2 text-muted-foreground">{d.driverNr ?? '—'}</td>
                      <td className="px-4 py-2 text-muted-foreground">{d.status ?? '—'}</td>
                      <td className="px-4 py-2 text-muted-foreground">{d.driverType ?? '—'}</td>
                      <td className="px-4 py-2 text-muted-foreground">{d.phone ?? '—'}</td>
                      <td className="px-4 py-2 text-muted-foreground">{d.email ?? '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex items-center justify-between mt-4 text-sm">
          <span className="text-muted-foreground">
            {total === 0
              ? 'No drivers'
              : `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}`}
          </span>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
            >
              Previous
            </Button>
            <span className="text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
            >
              Next
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
