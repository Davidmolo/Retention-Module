import type { GpDriver } from "@/lib/adapters/gp";
import { APP_TIMEZONE } from "@/lib/dates";

export function isLowOverall(rating: number) {
  return rating >= 1 && rating <= 3;
}

export function isHighOverall(rating: number) {
  return rating >= 4 && rating <= 5;
}

function todayPartsInAppTz(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get("year"), m: get("month"), d: get("day") };
}

export function daysSinceHire(hireDate: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(hireDate).slice(0, 10));
  if (!m) return 9999;
  const hiredUtc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const t = todayPartsInAppTz();
  const todayUtc = Date.UTC(t.y, t.m - 1, t.d);
  return Math.floor((todayUtc - hiredUtc) / (1000 * 60 * 60 * 24));
}

/** Tenure band for survey cadence — applies to company and owner-operator alike. */
export function tenureCategory(
  hireDate: string,
  _driverType?: GpDriver["driverType"]
) {
  const months = daysSinceHire(hireDate) / 30.4375;
  return months < 3 ? ("new" as const) : ("established" as const);
}

export function isSurveyEligible(driver: GpDriver) {
  if (!driver || driver.status !== "active") return false;
  return daysSinceHire(driver.hireDate) >= 7;
}

/** New drivers (<3 mo), including new owner-ops → every 14 days; established → monthly. */
export function surveyFrequencyLabel(driver: GpDriver) {
  return tenureCategory(driver.hireDate, driver.driverType) === "new"
    ? "every_2_weeks"
    : "monthly";
}

export function driverTypeLabel(type: GpDriver["driverType"]) {
  switch (type) {
    case "owner_operator":
      return "Owner Operator";
    case "contract":
      return "Contract Driver";
    default:
      return "Company Driver";
  }
}
