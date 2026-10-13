"use client";

import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const DEFAULT_PAGE_SIZE = 25;

export function usePagedSlice<T>(
  items: T[],
  page: number,
  pageSize = DEFAULT_PAGE_SIZE
) {
  return useMemo(() => {
    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
    const safePage = Math.min(Math.max(1, page), totalPages);
    const start = (safePage - 1) * pageSize;
    const slice = items.slice(start, start + pageSize);
    const from = total === 0 ? 0 : start + 1;
    const to = Math.min(start + pageSize, total);
    return { slice, total, totalPages, safePage, from, to, pageSize };
  }, [items, page, pageSize]);
}

export function ListPagination({
  page,
  totalPages,
  total,
  from,
  to,
  onPageChange,
  className,
}: {
  page: number;
  totalPages: number;
  total: number;
  from: number;
  to: number;
  onPageChange: (page: number) => void;
  className?: string;
}) {
  if (total === 0) return null;

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 border-t border-[var(--xxii-line)] px-4 py-3 sm:px-5 ${className || ""}`}
    >
      <p className="text-xs text-[var(--xxii-muted)]">
        Showing {from}–{to} of {total}
        {totalPages > 1 ? ` · Page ${page} of ${totalPages}` : ""}
      </p>
      {totalPages > 1 ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPageChange(Math.max(1, page - 1))}
            className="inline-flex items-center gap-1 rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft size={14} />
            Prev
          </button>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            className="inline-flex items-center gap-1 rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
            <ChevronRight size={14} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

export { DEFAULT_PAGE_SIZE as LIST_PAGE_SIZE };
