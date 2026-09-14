import type { GpDriver } from "@/lib/adapters/gp/mockGpAdapter";

export function isLowOverall(rating: number) {
  return rating >= 1 && rating <= 3;
}

export function isHighOverall(rating: number) {
  return rating >= 4 && rating <= 5;
}

export function daysSinceHire(hireDate: string) {
  const hired = new Date(hireDate);
  if (Number.isNaN(hired.getTime())) return 9999;
  return Math.floor((Date.now() - hired.getTime()) / (1000 * 60 * 60 * 24));
}

export function tenureCategory(hireDate: string, driverType: GpDriver["driverType"]) {
  if (driverType === "owner_operator") return "owner_operator" as const;
  const months = daysSinceHire(hireDate) / 30.4375;
  return months < 3 ? ("new" as const) : ("established" as const);
}

export function isSurveyEligible(driver: GpDriver) {
  if (!driver || driver.status !== "active") return false;
  return daysSinceHire(driver.hireDate) >= 7;
}

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
