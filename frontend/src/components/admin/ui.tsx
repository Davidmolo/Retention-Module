import clsx from "clsx";

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
          "status-done"
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
