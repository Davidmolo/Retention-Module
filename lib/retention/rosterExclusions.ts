/**
 * Drivers to hide from Retention (still may appear as active in OpenRoad/GP sync).
 * Test accounts, maintenance/staff, and people no longer with the company.
 */
export const RETENTION_EXCLUDED_DRIVER_IDS: ReadonlySet<number> = new Set([
  6010, // ACCOUNTING example — accounting/test account
  35468, // Dovydas Narcevicius — maintenance (not a driver)
  38119, // Leonard Washington — no longer with the company
  5223, // OSVALDAS IDAS — maintenance (not a driver)
  5309, // Paulius Kruzinauskas — maintenance/staff (not a driver)
  38378, // TEST — testing account
  900000001, // Shahmeer Test — TEMP retention test driver
  900000002, // Milos Test Driver — TEMP retention test driver
]);

export function isRetentionExcludedDriverId(id: string | number): boolean {
  const n = typeof id === "number" ? id : Number(String(id).trim());
  return Number.isFinite(n) && RETENTION_EXCLUDED_DRIVER_IDS.has(n);
}

export function filterRetentionRosterDrivers<T extends { id: string | number }>(
  drivers: T[]
): T[] {
  return drivers.filter((d) => !isRetentionExcludedDriverId(d.id));
}

/** SQL fragment: AND d.id NOT IN (...) — empty string if none configured. */
export function retentionExcludedDriversSql(alias = "d"): string {
  const ids = [...RETENTION_EXCLUDED_DRIVER_IDS];
  if (!ids.length) return "";
  return ` AND ${alias}.id NOT IN (${ids.join(", ")})`;
}
