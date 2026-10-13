import type { HTMLAttributes } from "react";
import clsx from "clsx";

/** Base shimmer block — use while waiting on API data. */
export function Skeleton({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx("xxii-skeleton", className)}
      aria-hidden
      {...props}
    />
  );
}

export function SkeletonText({
  className,
  lines = 1,
}: {
  className?: string;
  lines?: number;
}) {
  return (
    <div className={clsx("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={clsx(
            "h-3 rounded",
            i === lines - 1 && lines > 1 ? "w-2/3" : "w-full"
          )}
        />
      ))}
    </div>
  );
}

export function SkeletonKpiRow({ count = 4 }: { count?: number }) {
  return (
    <div
      className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      aria-busy="true"
      aria-label="Loading"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="xxii-card space-y-3 p-4">
          <Skeleton className="h-3 w-24 rounded" />
          <Skeleton className="h-8 w-16 rounded" />
          <Skeleton className="h-2.5 w-32 rounded" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({
  rows = 8,
  cols = 5,
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <div className="xxii-card overflow-hidden" aria-busy="true" aria-label="Loading">
      <div className="border-b border-[var(--xxii-line)] px-4 py-3">
        <Skeleton className="h-4 w-40 rounded" />
        <Skeleton className="mt-2 h-3 w-64 max-w-full rounded" />
      </div>
      <div className="hidden md:block">
        <div
          className="grid gap-3 border-b border-[var(--xxii-line)] bg-slate-50/80 px-4 py-3"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton key={i} className="h-3 w-20 rounded" />
          ))}
        </div>
        <div className="divide-y divide-[var(--xxii-line)]">
          {Array.from({ length: rows }).map((_, r) => (
            <div
              key={r}
              className="grid gap-3 px-4 py-3.5"
              style={{
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              }}
            >
              {Array.from({ length: cols }).map((_, c) => (
                <Skeleton
                  key={c}
                  className={clsx(
                    "h-4 rounded",
                    c === 0 ? "w-28" : "w-16"
                  )}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-3 p-3 md:hidden">
        {Array.from({ length: Math.min(rows, 5) }).map((_, i) => (
          <div
            key={i}
            className="space-y-2 rounded-xl border border-[var(--xxii-line)] p-3.5"
          >
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-36 rounded" />
                <Skeleton className="h-3 w-24 rounded" />
              </div>
            </div>
            <Skeleton className="h-3 w-full rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonList({ rows = 6 }: { rows?: number }) {
  return (
    <div
      className="xxii-card divide-y divide-[var(--xxii-line)] overflow-hidden"
      aria-busy="true"
      aria-label="Loading"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5">
          <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-40 max-w-[70%] rounded" />
            <Skeleton className="h-3 w-28 max-w-[50%] rounded" />
          </div>
          <Skeleton className="h-6 w-16 shrink-0 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonOverview() {
  return (
    <div className="w-full space-y-4" aria-busy="true" aria-label="Loading dashboard">
      <SkeletonKpiRow count={4} />
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="xxii-card space-y-4 p-4 sm:p-5">
            <Skeleton className="h-4 w-32 rounded" />
            <Skeleton className="h-40 w-full rounded-xl" />
          </div>
        ))}
      </div>
      <SkeletonTable rows={6} cols={6} />
    </div>
  );
}

export function SkeletonDriverDetail() {
  return (
    <div className="w-full space-y-4" aria-busy="true" aria-label="Loading driver">
      <Skeleton className="h-4 w-36 rounded" />
      <div className="xxii-card space-y-4 p-4 sm:p-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-14 w-14 rounded-2xl sm:h-16 sm:w-16" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-48 rounded" />
            <Skeleton className="h-3 w-32 rounded" />
          </div>
        </div>
        <Skeleton className="h-10 w-full rounded-xl" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function SkeletonInbox() {
  return (
    <div
      className="grid min-h-[420px] flex-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)]"
      aria-busy="true"
      aria-label="Loading inbox"
    >
      <div className="xxii-card flex flex-col overflow-hidden">
        <div className="border-b border-[var(--xxii-line)] p-3">
          <Skeleton className="h-9 w-full rounded-xl" />
        </div>
        <div className="divide-y divide-[var(--xxii-line)]">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3 px-3 py-3">
              <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-32 rounded" />
                <Skeleton className="h-3 w-44 max-w-full rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="xxii-card flex flex-col gap-3 p-4 sm:p-5">
        <div className="space-y-2 border-b border-[var(--xxii-line)] pb-3">
          <Skeleton className="h-5 w-48 rounded" />
          <Skeleton className="h-3 w-36 rounded" />
        </div>
        <SkeletonThread fill />
      </div>
    </div>
  );
}

export function SkeletonThread({ fill = false }: { fill?: boolean }) {
  return (
    <div
      className={clsx("flex min-h-0 flex-col gap-3", fill && "flex-1")}
      aria-busy="true"
      aria-label="Loading messages"
    >
      <div
        className={clsx(
          "space-y-3 rounded-xl border border-[var(--xxii-line)] bg-slate-50/80 p-3",
          fill ? "min-h-0 flex-1" : "min-h-[240px]"
        )}
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className={clsx("flex", i % 2 === 0 ? "justify-end" : "justify-start")}
          >
            <Skeleton
              className={clsx(
                "h-14 rounded-2xl",
                i % 2 === 0 ? "w-[55%]" : "w-[45%]"
              )}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-16 flex-1 rounded-xl" />
        <Skeleton className="h-10 w-20 self-end rounded-xl" />
      </div>
    </div>
  );
}

export function SkeletonReasons() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading feedback">
      <div className="flex justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-3 w-24 rounded" />
          <Skeleton className="h-6 w-48 rounded" />
          <Skeleton className="h-3 w-72 max-w-full rounded" />
        </div>
        <Skeleton className="h-9 w-36 rounded-xl" />
      </div>
      <SkeletonKpiRow count={3} />
      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="xxii-card space-y-3 p-4">
          <Skeleton className="h-4 w-40 rounded" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="flex justify-between">
                <Skeleton className="h-3 w-20 rounded" />
                <Skeleton className="h-3 w-6 rounded" />
              </div>
              <Skeleton className="h-2 w-full rounded-full" />
            </div>
          ))}
        </div>
        <SkeletonList rows={6} />
      </div>
    </div>
  );
}

export function SkeletonSummaryCards({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading summary">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="xxii-card overflow-hidden">
          <div className="border-b border-[var(--xxii-line)] px-4 py-3">
            <Skeleton className="h-4 w-28 rounded" />
            <Skeleton className="mt-2 h-3 w-56 max-w-full rounded" />
          </div>
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, r) => (
              <Skeleton key={r} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
