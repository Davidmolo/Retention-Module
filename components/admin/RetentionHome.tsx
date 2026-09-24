"use client";

import { useEffect, useState } from "react";
import { RetentionDashboard } from "./RetentionDashboard";
import {
  fetchOverview,
  getCachedOverview,
  OVERVIEW_UPDATED_EVENT,
} from "@/lib/retention/driverCache";
import type { RetentionView } from "@/lib/retention/viewNav";

type Overview = Parameters<typeof RetentionDashboard>[0]["data"];

export function RetentionHome({ initialView }: { initialView: RetentionView }) {
  const [data, setData] = useState<Overview | null>(() =>
    getCachedOverview<Overview>()
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchOverview<Overview>()
      .then((fresh) => {
        if (cancelled) return;
        setData(fresh);
        setError(null);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        if (!getCachedOverview()) {
          setError(e.message || "Failed to load dashboard");
        }
      });

    const onOverviewUpdated = (e: Event) => {
      const next = (e as CustomEvent<Overview>).detail;
      if (next) setData(next);
    };
    window.addEventListener(OVERVIEW_UPDATED_EVENT, onOverviewUpdated);

    return () => {
      cancelled = true;
      window.removeEventListener(OVERVIEW_UPDATED_EVENT, onOverviewUpdated);
    };
  }, []);

  if (error && !data) {
    return (
      <div className="xxii-card p-8 text-sm text-rose-600">{error}</div>
    );
  }

  if (!data) {
    return (
      <div className="w-full min-w-0 max-w-full space-y-4 overflow-x-hidden">
        <div className="grid animate-pulse gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="xxii-card h-28 bg-slate-100" />
          ))}
        </div>
        <div className="grid animate-pulse gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="xxii-card h-56 bg-slate-100" />
          ))}
        </div>
        <div className="xxii-card h-64 animate-pulse bg-slate-100" />
      </div>
    );
  }

  return <RetentionDashboard data={data} initialView={initialView} />;
}
