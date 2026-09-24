/**
 * Mock GP adapter for local demo until the live GP module is linked.
 * Keep method signatures aligned with ./types.ts (GpAdapter).
 */

import type { GpAdapter, GpDriver, SixWeekAverages } from "./types";

export type { DriverType, DriverStatus, GpDriver, SixWeekAverages, GpAdapter } from "./types";

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

const MOCK_DRIVERS: GpDriver[] = [
  {
    id: "gp-drv-001",
    name: "Michael Torres",
    email: "michael.torres@email.com",
    phone: "+1 (555) 010-0001",
    driverType: "company",
    status: "active",
    hireDate: "2026-06-01",
    dispatcher: "Eric Wilson",
    cpm: 0.54,
    avatarInitials: "MT",
  },
  {
    id: "gp-drv-002",
    name: "Sara Nguyen",
    email: "sara.nguyen@email.com",
    phone: "+1 (555) 010-0002",
    driverType: "owner_operator",
    status: "active",
    hireDate: "2024-02-14",
    dispatcher: "Eric Blake",
    cpm: 0.71,
    avatarInitials: "SN",
  },
  {
    id: "gp-drv-003",
    name: "James Carter",
    email: "james.carter@email.com",
    phone: "+1 (555) 010-0003",
    driverType: "contract",
    status: "active",
    hireDate: "2025-11-20",
    dispatcher: "Art Lopez",
    cpm: 0.58,
    avatarInitials: "JC",
  },
  {
    id: "gp-drv-004",
    name: "Priya Shah",
    email: "priya.shah@email.com",
    phone: "+1 (555) 010-0004",
    driverType: "company",
    status: "active",
    hireDate: daysAgo(5),
    dispatcher: "Eric Blake",
    cpm: 0.55,
    avatarInitials: "PS",
  },
  {
    id: "gp-drv-005",
    name: "Luis Romero",
    email: "luis.romero@email.com",
    phone: "+1 (555) 010-0005",
    driverType: "company",
    status: "inactive",
    hireDate: "2023-08-01",
    dispatcher: "Art Lopez",
    cpm: 0.6,
    avatarInitials: "LR",
  },
  {
    id: "gp-drv-006",
    name: "Dana Brooks",
    email: "dana.brooks@email.com",
    phone: "+1 (555) 010-0006",
    driverType: "company",
    status: "active",
    hireDate: "2025-01-10",
    dispatcher: "Eric Wilson",
    cpm: 0.66,
    avatarInitials: "DB",
  },
  {
    id: "gp-drv-007",
    name: "Robert Kim",
    email: "robert.kim@email.com",
    phone: "+1 (555) 010-0007",
    driverType: "company",
    status: "active",
    hireDate: "2024-09-01",
    dispatcher: "Art Lopez",
    cpm: 0.59,
    avatarInitials: "RK",
  },
  {
    id: "gp-drv-008",
    name: "Elena Vasquez",
    email: "elena.vasquez@email.com",
    phone: "+1 (555) 010-0008",
    driverType: "contract",
    status: "active",
    hireDate: "2025-08-12",
    dispatcher: "Eric Wilson",
    cpm: 0.61,
    avatarInitials: "EV",
  },
];

const MOCK_AVERAGES: Record<string, SixWeekAverages> = {
  "gp-drv-001": { milesPerWeek: 2450, driverPayroll: 1320, grossMarginPct: 18, cpm: 0.54 },
  "gp-drv-002": { milesPerWeek: 2100, driverPayroll: 2400, grossMarginPct: 22.1, cpm: 0.71 },
  "gp-drv-003": { milesPerWeek: 1950, driverPayroll: 1600, grossMarginPct: 14.2, cpm: 0.58 },
  "gp-drv-004": { milesPerWeek: 800, driverPayroll: 620, grossMarginPct: 11, cpm: 0.55 },
  "gp-drv-005": { milesPerWeek: 0, driverPayroll: 0, grossMarginPct: 0, cpm: 0.6 },
  "gp-drv-006": { milesPerWeek: 2320, driverPayroll: 1780, grossMarginPct: 19.6, cpm: 0.66 },
  "gp-drv-007": { milesPerWeek: 2200, driverPayroll: 1500, grossMarginPct: 16.5, cpm: 0.59 },
  "gp-drv-008": { milesPerWeek: 2050, driverPayroll: 1410, grossMarginPct: 15.8, cpm: 0.61 },
};

export const mockGpAdapter: GpAdapter = {
  name: "mock",
  async listDrivers({ includeInactive = false } = {}) {
    return MOCK_DRIVERS.filter((d) => includeInactive || d.status === "active");
  },
  async getDriver(driverId: string) {
    return MOCK_DRIVERS.find((d) => d.id === String(driverId)) || null;
  },
  async getSixWeekAverages(driverId: string): Promise<SixWeekAverages> {
    return (
      MOCK_AVERAGES[String(driverId)] || {
        milesPerWeek: null,
        driverPayroll: null,
        grossMarginPct: null,
        cpm: null,
      }
    );
  },
};
