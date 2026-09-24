export type RetentionView =
  | "overview"
  | "at-risk"
  | "follow-ups"
  | "exit"
  | "reasons"
  | "responses";

export type ResponsesFilter = "all" | "pending" | "completed" | "non_response";

export const RETENTION_VIEW_EVENT = "retention:view";

const VIEWS = new Set<string>([
  "overview",
  "at-risk",
  "follow-ups",
  "exit",
  "reasons",
  "responses",
]);

const RESPONSE_FILTERS = new Set<string>([
  "pending",
  "completed",
  "non_response",
]);

export function parseRetentionView(
  search: string = typeof window !== "undefined" ? window.location.search : ""
): RetentionView {
  const raw = new URLSearchParams(search).get("view");
  if (raw && VIEWS.has(raw) && raw !== "overview") return raw as RetentionView;
  return "overview";
}

export function parseResponsesFilter(
  search: string = typeof window !== "undefined" ? window.location.search : ""
): ResponsesFilter {
  const raw = new URLSearchParams(search).get("filter");
  if (raw && RESPONSE_FILTERS.has(raw)) return raw as ResponsesFilter;
  return "all";
}

export function retentionViewPath(
  view: RetentionView,
  extra?: { filter?: ResponsesFilter }
): string {
  const params = new URLSearchParams();
  if (view !== "overview") params.set("view", view);
  if (
    view === "responses" &&
    extra?.filter &&
    RESPONSE_FILTERS.has(extra.filter)
  ) {
    params.set("filter", extra.filter);
  }
  const q = params.toString();
  return q ? `/retention?${q}` : "/retention";
}

/** Instant view switch on /retention — updates URL without a Next.js RSC refetch. */
export function navigateRetentionView(
  view: RetentionView,
  extra?: { filter?: ResponsesFilter }
) {
  const path = retentionViewPath(view, extra);
  window.history.pushState({ retentionView: view }, "", path);
  window.dispatchEvent(new CustomEvent(RETENTION_VIEW_EVENT, { detail: view }));
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
}
