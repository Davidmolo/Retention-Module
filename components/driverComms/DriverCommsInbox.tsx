"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { DriverSmsThread } from "@/components/admin/DriverSmsThread";

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
    <div className="flex h-[calc(100dvh-7.5rem)] min-h-[420px] flex-col gap-3 md:h-[calc(100dvh-3rem)]">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Driver Comms</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            SMS threads for OpenRoad drivers — replaces SimpleText for
            fleet messaging. Uses XXII Century GHL.
          </p>
        </div>
        <Link
          href="/driver-comms/broadcast"
          className="rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background"
        >
          Broadcast to fleet
        </Link>
      </div>

      {error ? (
        <p className="shrink-0 text-sm text-destructive">{error}</p>
      ) : null}

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
          <div className="shrink-0 border-b border-border p-3">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search drivers…"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {loading && !drivers.length ? (
              <li className="p-4 text-sm text-muted-foreground">Loading…</li>
            ) : null}
            {!loading && !drivers.length ? (
              <li className="p-4 text-sm text-muted-foreground">
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
                    className={`w-full border-b border-border px-3 py-3 text-left transition ${
                      active ? "bg-muted" : "hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold">
                        {d.name}
                      </span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {formatWhen(d.lastMessageAt)}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {d.lastMessagePreview || d.phone || "No messages yet"}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card p-4">
          {selected ? (
            <>
              <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
                <div>
                  <h2 className="text-lg font-semibold">{selected.name}</h2>
                  <p className="text-xs text-muted-foreground">
                    {selected.phone || "No phone"} · OpenRoad #{selected.id}
                  </p>
                </div>
                <Link
                  href={`/retention/drivers/${selected.id}?tab=Messages`}
                  className="text-xs font-medium text-muted-foreground underline-offset-2 hover:underline"
                >
                  Open in Retention
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
            <p className="text-sm text-muted-foreground">
              Select a driver to view their SMS thread.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
