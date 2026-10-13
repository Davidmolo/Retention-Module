"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { DriverSmsThread } from "@/components/admin/DriverSmsThread";
import { SkeletonInbox } from "@/components/ui/skeleton";

type DriverRow = {
  id: string;
  name: string;
  phone: string | null;
  status: string;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
};

function formatWhen(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function initials(name: string): string {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function DriverCommsInbox() {
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (query: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      const res = await fetch(`/api/driver-comms/drivers?${params}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to load");
      const list = (json.data?.drivers || []) as DriverRow[];
      setDrivers(list);
      setSelectedId((prev) => {
        if (prev && list.some((d) => d.id === prev)) return prev;
        return list[0]?.id || null;
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load("");
  }, [load]);

  useEffect(() => {
    const t = setTimeout(() => void load(q), 250);
    return () => clearTimeout(t);
  }, [q, load]);

  const selected = drivers.find((d) => d.id === selectedId) || null;

  return (
    <div className="flex h-[calc(100dvh-7.5rem)] min-h-[420px] flex-col gap-4 md:h-[calc(100dvh-3.5rem)]">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--xxii-muted)]">
            Driver communication
          </div>
          <h1 className="mt-1 text-xl font-extrabold tracking-tight text-[var(--xxii-text)] sm:text-2xl">
            Inbox
          </h1>
          <p className="mt-1 max-w-xl text-sm text-[var(--xxii-muted)]">
            Per-driver SMS threads (OpenRoad roster via XXII Century GHL).
            Replaces SimpleText for fleet messaging.
          </p>
        </div>
        <Link
          href="/driver-comms/broadcast"
          className="rounded-xl bg-[var(--xxii-blue)] px-4 py-2 text-sm font-bold text-white hover:opacity-95"
        >
          Broadcast to fleet
        </Link>
      </div>

      {error ? (
        <p className="shrink-0 text-sm font-medium text-rose-600">{error}</p>
      ) : null}

      {loading && !drivers.length ? (
        <SkeletonInbox />
      ) : (
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="xxii-card flex min-h-0 flex-col overflow-hidden">
          <div className="shrink-0 border-b border-[var(--xxii-line)] p-3">
            <div className="relative">
              <Search
                size={14}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search drivers…"
                className="w-full rounded-xl border border-[var(--xxii-line)] bg-white py-2 pl-8 pr-3 text-sm outline-none focus:border-[var(--xxii-blue)]"
              />
            </div>
          </div>
          <ul className="min-h-0 flex-1 divide-y divide-[var(--xxii-line)] overflow-y-auto">
            {!drivers.length ? (
              <li className="px-4 py-8 text-center text-sm text-[var(--xxii-muted)]">
                No active drivers found. Sync OpenRoad roster first.
              </li>
            ) : null}
            {drivers.map((d) => {
              const active = d.id === selectedId;
              return (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(d.id)}
                    className={`flex w-full items-start gap-3 px-3 py-3 text-left transition ${
                      active
                        ? "bg-[var(--xxii-blue-soft)]"
                        : "hover:bg-sky-50/50"
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        active
                          ? "bg-[var(--xxii-blue)] text-white"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {initials(d.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-[var(--xxii-text)]">
                          {d.name}
                        </span>
                        <span className="shrink-0 text-[10px] font-medium text-[var(--xxii-muted)]">
                          {formatWhen(d.lastMessageAt)}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-[var(--xxii-muted)]">
                        {d.lastMessagePreview || d.phone || "No messages yet"}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <section className="xxii-card flex min-h-0 flex-col overflow-hidden p-4 sm:p-5">
          {selected ? (
            <>
              <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--xxii-line)] pb-3">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-extrabold tracking-tight text-[var(--xxii-text)]">
                    {selected.name}
                  </h2>
                  <p className="text-xs text-[var(--xxii-muted)]">
                    {selected.phone || "No phone"} · OpenRoad #{selected.id}
                  </p>
                </div>
                <Link
                  href={`/retention/drivers/${selected.id}?tab=Messages`}
                  className="text-xs font-bold text-[var(--xxii-blue)] hover:underline"
                >
                  Open in Retention →
                </Link>
              </div>
              <DriverSmsThread
                key={selected.id}
                driverId={selected.id}
                fill
                apiBase={`/api/driver-comms/drivers/${encodeURIComponent(selected.id)}/messages`}
              />
            </>
          ) : (
            <p className="py-12 text-center text-sm text-[var(--xxii-muted)]">
              Select a driver to view their SMS thread.
            </p>
          )}
        </section>
      </div>
      )}
    </div>
  );
}
