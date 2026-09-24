/**
 * Portable GP adapter contract — live GP must implement this interface.
 * Do not change method names or return shapes without updating retention consumers.
 */

export type DriverType = "company" | "owner_operator" | "contract";
export type DriverStatus = "active" | "inactive" | "terminated";

export type GpDriver = {
  id: string;
  name: string;
  email: string;
  phone: string;
  driverType: DriverType;
  status: DriverStatus;
  /** ISO date YYYY-MM-DD or full ISO string */
  hireDate: string;
  /** ISO date YYYY-MM-DD from TMS dob; null if unknown */
  birthDate?: string | null;
  dispatcher: string;
  cpm: number | null;
  avatarInitials: string;
};

export type SixWeekAverages = {
  milesPerWeek: number | null;
  driverPayroll: number | null;
  grossMarginPct: number | null;
  cpm: number | null;
  /** How many weekly report rows were averaged (0 = none in DB). */
  weeksCounted?: number;
};

export type GpAdapterName = "mock" | "live";

export type GpAdapter = {
  name: GpAdapterName;
  listDrivers(opts?: { includeInactive?: boolean }): Promise<GpDriver[]>;
  getDriver(driverId: string): Promise<GpDriver | null>;
  getSixWeekAverages(driverId: string): Promise<SixWeekAverages>;
};
