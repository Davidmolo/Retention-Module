"use client";

import { useEffect, useState } from "react";
import { RetentionDashboard } from "./RetentionDashboard";
import {
  fetchOverview,
  getCachedOverview,
  OVERVIEW_UPDATED_EVENT,
} from "@/lib/retention/driverCache";
import type { RetentionView } from "@/lib/retention/viewNav";
import { SkeletonOverview } from "@/components/ui/skeleton";

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
    return <SkeletonOverview />;
  }

  return <RetentionDashboard data={data} initialView={initialView} />;
}
