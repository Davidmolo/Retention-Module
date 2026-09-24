type Payload = unknown;

const driverCache = new Map<string, { at: number; data: Payload }>();
let overviewCache: { at: number; data: Payload; version: number } | null = null;

/** Bump when overview payload shape / semantics change so stale client caches drop. */
const OVERVIEW_CACHE_VERSION = 4;

const TTL_MS = 120_000;

/** Invalidation generation — in-flight fetches must not rewrite cache after invalidate. */
let overviewFetchGen = 0;

export const OVERVIEW_UPDATED_EVENT = "retention:overview-updated";

export function getCachedDriverDetail<T>(driverId: string): T | null {
  const hit = driverCache.get(driverId);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) {
    driverCache.delete(driverId);
    return null;
  }
  return hit.data as T;
}

export function setCachedDriverDetail(driverId: string, data: Payload) {
  driverCache.set(driverId, { at: Date.now(), data });
}

export function invalidateDriverDetail(driverId: string) {
  driverCache.delete(driverId);
}

export function prefetchDriverDetail(driverId: string) {
  if (getCachedDriverDetail(driverId)) return;
  void fetch(`/api/retention/drivers/${encodeURIComponent(driverId)}`)
    .then(async (res) => {
      const json = await res.json();
      if (json.ok) setCachedDriverDetail(driverId, json.data);
    })
    .catch(() => {});
}

export function getCachedOverview<T>(): T | null {
  if (!overviewCache) return null;
  if (overviewCache.version !== OVERVIEW_CACHE_VERSION) {
    overviewCache = null;
    return null;
  }
  if (Date.now() - overviewCache.at > TTL_MS) {
    overviewCache = null;
    return null;
  }
  return overviewCache.data as T;
}

export function setCachedOverview(data: Payload) {
  overviewCache = { at: Date.now(), data, version: OVERVIEW_CACHE_VERSION };
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(OVERVIEW_UPDATED_EVENT, { detail: data })
    );
  }
}

export function invalidateOverviewCache() {
  overviewCache = null;
  overviewFetchGen += 1;
  overviewInflight = null;
}

let overviewInflight: Promise<unknown> | null = null;

export function fetchOverview<T>(): Promise<T> {
  if (overviewInflight) return overviewInflight as Promise<T>;
  const gen = overviewFetchGen;
  overviewInflight = fetch("/api/retention/overview", { cache: "no-store" })
    .then(async (res) => {
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Failed to load overview");
      if (gen === overviewFetchGen) {
        setCachedOverview(json.data);
      }
      return json.data as T;
    })
    .finally(() => {
      if (gen === overviewFetchGen) {
        overviewInflight = null;
      }
    });
  return overviewInflight as Promise<T>;
}

/** Warm the overview cache (e.g. before navigating back). */
export function prefetchOverview() {
  if (getCachedOverview()) return;
  void fetchOverview().catch(() => {});
}

/** Drop client overview cache and fetch fresh data. */
export function refreshOverview(): Promise<unknown> {
  invalidateOverviewCache();
  return fetchOverview().catch(() => null);
}

type OverviewLike = {
  kpis: { atRiskCount: number; [key: string]: unknown };
  drivers: Array<{
    driverId: string;
    atRisk: boolean;
    caseStatus: string | null;
    [key: string]: unknown;
  }>;
  recentResponses: Array<{
    driverId: string;
    status: string;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
};

/** Instant client-side overview patch when a case status changes (before refetch). */
export function patchOverviewCaseStatus(
  driverId: string,
  status: string,
  atRisk: boolean
) {
  const current = getCachedOverview<OverviewLike>();
  if (!current?.drivers || !current?.recentResponses) {
    // Ensure a fetch is in flight so Back to Overview gets fresh data.
    void refreshOverview();
    return;
  }

  const drivers = current.drivers.map((d) =>
    d.driverId === driverId ? { ...d, caseStatus: status, atRisk } : d
  );
  const recentResponses = current.recentResponses.map((r) =>
    r.driverId === driverId && r.status !== "Completed"
      ? { ...r, status }
      : r
  );
  const atRiskCount = drivers.filter((d) => d.atRisk).length;

  setCachedOverview({
    ...current,
    drivers,
    recentResponses,
    kpis: { ...current.kpis, atRiskCount },
  });
}
