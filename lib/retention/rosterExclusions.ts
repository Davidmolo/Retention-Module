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

/**
 * Drivers eligible for Retention UI + automated SMS.
 * - OpenRoad status must be exactly active
 * - date_removed must be empty or still in the future (recent terminations drop out)
 * - hardcoded exclusions
 */
export function retentionRosterActiveSql(alias = "d"): string {
  return (
    ` ${alias}.status IS NOT NULL` +
    ` AND LOWER(TRIM(${alias}.status)) = 'active'` +
    ` AND (${alias}.date_removed IS NULL OR ${alias}.date_removed > CURDATE())` +
    retentionExcludedDriversSql(alias)
  );
}

/** True when a removal date is today or earlier (Chicago/SQL DATE). */
export function isDriverDateRemoved(
  dateRemoved: string | Date | null | undefined
): boolean {
  if (dateRemoved == null || dateRemoved === "") return false;
  const raw =
    dateRemoved instanceof Date
      ? dateRemoved.toISOString().slice(0, 10)
      : String(dateRemoved).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const today = new Date();
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.APP_TIMEZONE || "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(today);
  return raw <= ymd;
}
