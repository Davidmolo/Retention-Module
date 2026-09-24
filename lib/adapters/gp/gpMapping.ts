/**
 * Pure mappers: GP MySQL / OpenRoad strings → Retention GpDriver fields.
 * Safe to keep as-is when merging into D:\grossProfit.
 *
 * Timezone: OpenRoad UTC timestamps → America/Chicago wall (lib/dates.ts).
 * Hire date for Retention: OpenRoad created_at (source_created_at), else date_added.
 */

import type { DriverStatus, DriverType, GpDriver } from "./types";
import { toSqlDate } from "@/lib/dates";

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

/** Map OpenRoad / GP driver_type strings into retention enums. */
export function mapDriverType(raw: string | null | undefined): DriverType {
  const t = (raw || "").toLowerCase().replace(/[\s-]+/g, "_");
  if (
    t.includes("owner") ||
    t.includes("oo") ||
    t === "owner_operator" ||
    t === "owneroperator"
  ) {
    return "owner_operator";
  }
  if (t.includes("contract") || t.includes("lease")) return "contract";
  return "company";
}

/**
 * OpenRoad statuses → Retention.
 * Only true "active" counts as active. suspended / suspended_new / etc. are not.
 */
export function mapDriverStatus(raw: string | null | undefined): DriverStatus {
  const s = (raw || "").trim().toLowerCase();
  if (s === "active") return "active";
  if (s.includes("terminat") || s.includes("removed")) return "terminated";
  return "inactive";
}

/** Calendar YYYY-MM-DD from MySQL DATE / Date / string (no UTC day-shift). */
export function toCalendarDate(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    // mysql2 DATE → JS Date at UTC midnight; use UTC calendar parts.
    if (
      value.getUTCHours() === 0 &&
      value.getUTCMinutes() === 0 &&
      value.getUTCSeconds() === 0
    ) {
      const y = value.getUTCFullYear();
      const m = String(value.getUTCMonth() + 1).padStart(2, "0");
      const d = String(value.getUTCDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
  }
  // String like "1956-05-07T19:00:00.000Z" from bad prior reads — prefer DATE prefix
  // only when it looks like a pure date or midnight; otherwise toSqlDate.
  const s = String(value).trim();
  const dateOnly = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  if (dateOnly && (s.length === 10 || /T00:00:00/.test(s))) {
    return dateOnly[1];
  }
  // If mysql returned "Thu May 07 1956..." avoid; fall through to toSqlDate
  return toSqlDate(s.length >= 10 ? s.slice(0, 10) : s) || toSqlDate(s);
}

export type GpDriverRow = {
  id: number | string;
  name: string;
  email: string | null;
  phone: string | null;
  driverType: string | null;
  status: string | null;
  hireDate: string | null;
  /** ISO date YYYY-MM-DD from drivers.dob */
  birthDate?: string | null;
  dispatcher: string | null;
  cpm: number | null;
};

export function toGpDriver(row: GpDriverRow): GpDriver {
  const name = row.name?.trim() || `Driver ${row.id}`;
  return {
    id: String(row.id),
    name,
    email: row.email || "",
    phone: row.phone || "",
    driverType: mapDriverType(row.driverType),
    status: mapDriverStatus(row.status),
    hireDate: toCalendarDate(row.hireDate) || "1970-01-01",
    birthDate: toCalendarDate(row.birthDate),
    dispatcher: row.dispatcher?.trim() || "Unassigned",
    cpm: row.cpm == null || Number.isNaN(Number(row.cpm)) ? null : Number(row.cpm),
    avatarInitials: initialsFromName(name),
  };
}
