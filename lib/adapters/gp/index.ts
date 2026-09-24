import type { GpAdapter, GpAdapterName } from "./types";
import { mockGpAdapter } from "./mockGpAdapter";
import { liveGpAdapter } from "./liveGpAdapter";

export { bindLiveGpDb } from "./liveGpAdapter";
export {
  mapDriverType,
  mapDriverStatus,
  initialsFromName,
  toGpDriver,
} from "./gpMapping";

/**
 * Resolve the active GP adapter from env.
 * - GP_ADAPTER=live (default) → MySQL drivers + gross_profit_reports
 * - GP_ADAPTER=mock → demo roster only (opt-in for UI work without DB)
 */
export function getGpAdapter(): GpAdapter {
  const mode = (process.env.GP_ADAPTER || "live").toLowerCase();
  if (mode === "mock") return mockGpAdapter;
  return liveGpAdapter;
}

export function getGpMode(): GpAdapterName {
  return getGpAdapter().name;
}

export function isLiveGp(): boolean {
  return getGpMode() === "live";
}

export type {
  DriverType,
  DriverStatus,
  GpDriver,
  SixWeekAverages,
  GpAdapter,
  GpAdapterName,
} from "./types";
