import clsx from "clsx";
import { DEPARTMENTS } from "@/lib/retention/types";

export function StatusPill({ status }: { status?: string | null }) {
  if (!status) return <span className="text-sm text-[var(--xxii-muted)]">—</span>;
  const key = status.toLowerCase();
  return (
    <span
      className={clsx(
        "status-pill",
        key.includes("open") && "status-open",
        (key.includes("progress") || key.includes("in progress")) && "status-progress",
        (key.includes("complete") || key.includes("resolved") || key.includes("done")) &&
          "status-done",
        (key.includes("pending") || key.includes("reminded")) && "status-progress",
        (key.includes("no response") || key.includes("non-response") || key.includes("non_response")) &&
          "status-open"
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}

export function Stars({ value, size = "md" }: { value: number; size?: "sm" | "md" }) {
  const cls = size === "sm" ? "text-sm" : "text-base";
  return (
    <span className={clsx("font-bold tracking-tight text-amber-500", cls)} aria-label={`${value} stars`}>
      {"★".repeat(Math.max(0, Math.min(5, value)))}
      <span className="text-slate-300">{"★".repeat(Math.max(0, 5 - value))}</span>
    </span>
  );
}

/** Always lists all four departments with their scores (or — if not collected). */
export function DepartmentRatingsCell({
  ratings,
}: {
  ratings?: { department: string; rating: number }[] | null;
}) {
  const byDept = new Map((ratings || []).map((d) => [d.department, d.rating]));
  const hasAny = (ratings || []).some((d) => d.rating >= 1);

  if (!hasAny) {
    return (
      <span
        className="text-xs text-slate-400"
        title="Department ratings are only collected for overall scores of 1–3"
      >
        Not collected
      </span>
    );
  }

  return (
    <div className="flex min-w-[9.5rem] flex-col gap-0.5 text-xs leading-snug text-slate-700">
      {DEPARTMENTS.map((dept) => {
        const rating = byDept.get(dept);
        const low = typeof rating === "number" && rating <= 3;
        return (
          <div key={dept} className="flex items-center justify-between gap-3">
            <span className="font-medium">{dept}</span>
            {typeof rating === "number" && rating >= 1 ? (
              <span
                className={clsx(
                  "font-bold tabular-nums",
                  low ? "text-rose-600" : "text-amber-600"
                )}
              >
                {rating}★
              </span>
            ) : (
              <span className="text-slate-300">—</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
