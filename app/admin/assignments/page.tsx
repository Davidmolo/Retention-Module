'use client';

import { useCallback, useEffect, useState } from 'react';
import { Navigation } from '@/components/Navigation';
import { Button } from '@/components/ui/button';

interface Assignment {
  id: number;
  driverName: string | null;
  truckUnit: string | null;
  truckMake: string | null;
  truckModel: string | null;
  type: string | null;
  startDate: string | null;
  endDate: string | null;
}

const PAGE_SIZE = 25;

export default function AssignmentsPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [currentOnly, setCurrentOnly] = useState(true);
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
      if (currentOnly) params.set('currentOnly', '1');
      const res = await fetch(`/api/assignments?${params.toString()}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setAssignments(data.assignments ?? []);
      setTotal(data.total ?? 0);
      setError('');
    } catch {
      setError('Failed to load assignments');
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, currentOnly]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (error) {
    return (
      <div className="min-h-screen bg-background md:pl-60 pt-14 md:pt-0">
        <Navigation currentPage="assignments" />
        <div className="flex items-center justify-center h-96">
          <p className="text-destructive">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background md:pl-60 pt-14 md:pt-0">
      <Navigation currentPage="assignments" />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold text-foreground">Assignments</h1>
          <span className="text-sm text-muted-foreground">
            {total} assignments · from TMS
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search driver or truck unit…"
            className="flex-1 min-w-[16rem] max-w-md px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={currentOnly}
              onChange={(e) => {
                setCurrentOnly(e.target.checked);
                setPage(1);
              }}
            />
            Current only
          </label>
        </div>

        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Driver</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Truck</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Type</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Start</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">End</th>
                </tr>
              </thead>
              <tbody>
                {loading && assignments.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                      Loading…
                    </td>
                  </tr>
                ) : assignments.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                      No assignments found
                    </td>
                  </tr>
                ) : (
                  assignments.map((a, idx) => (
                    <tr key={a.id} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted'}>
                      <td className="px-4 py-2 font-medium text-card-foreground">
                        {a.driverName || '—'}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {a.truckUnit
                          ? `${a.truckUnit}${a.truckMake ? ` · ${a.truckMake}${a.truckModel ? ` ${a.truckModel}` : ''}` : ''}`
                          : '—'}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">{a.type ?? '—'}</td>
                      <td className="px-4 py-2 text-muted-foreground">{a.startDate ?? '—'}</td>
                      <td className="px-4 py-2">
                        {a.endDate ? (
                          <span className="text-muted-foreground">{a.endDate}</span>
                        ) : (
                          <span className="text-green-600 font-medium">Current</span>
                        )}
                      </td>
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
              ? 'No assignments'
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
