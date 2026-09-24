// Shared shapes for the weekly gross-profit data served by /api/data.
// NOTE: the example .xlsx is NOT a data source — it was only an example of
// output. This data is computed from the DB (see app/api/data/route.ts →
// getWeeklySummary).

export interface Trip {
  tripNumber: number;
  driverName: string;
}

export interface Driver {
  id: number;
  name: string;
  /** TMS driver_type (e.g. company_driver, owner_operator). */
  driverType?: string | null;
  trips: Trip[];
  tripCount: number;
  rate: number;
  mileage: number;
  totalGrossIncome: number;
  driversPay: number;
  fuel: number;
  prepass: number;
  monitoringLogs: number;
  rm: number;
  equipmentLease: number;
  liabilityInsurance: number;
  totalExpenses: number;
  netProfit: number;
}

export interface GrossProfitData {
  drivers: Driver[];
  totalMileage: number;
  totalGrossIncome: number;
  totalExpenses: number;
  totalNetProfit: number;
}
