// TMS (Transportation Management System) source — provides everything on the
// sheet that is NOT fuel: trips, mileage, gross income, driver pay, fee rates.
//
// The concrete API (endpoint, auth, response shape) is not yet wired. This file
// defines the CONTRACT the rest of the app codes against, plus a stub. To finish
// the integration, implement `HttpTmsSource.getWeek` to call the real API and
// map its response into `TmsWeekData`.

export interface TmsDriverWeek {
  name: string;
  block: 1 | 2; // which grid block on the sheet this driver belongs to
  trips?: number | null;
  mileage?: number | null;
  grossIncome?: number | null;
  // Block 1 only:
  driversPay?: number | null;
  prepass?: number | null;
  monitoringLogs?: number | null;
  // Block 2 only:
  xxiiFeeRate?: number | null;
}

export interface TmsWeekData {
  drivers: TmsDriverWeek[];
}

export interface TmsSource {
  getWeek(year: number, week: number): Promise<TmsWeekData>;
}

/** Returned until the TMS API is configured. Fails loudly with guidance. */
export class NotConfiguredTmsSource implements TmsSource {
  async getWeek(): Promise<TmsWeekData> {
    throw new Error(
      'TMS source is not configured. Set TMS_API_URL (and any auth) and ' +
        'implement HttpTmsSource.getWeek() in lib/sources/tms.ts. Until then, ' +
        'generate sheets by POSTing an explicit payload to /api/sheets.'
    );
  }
}

/** Skeleton for the real integration — fill in once the API shape is known. */
export class HttpTmsSource implements TmsSource {
  constructor(private readonly baseUrl: string) {}

  async getWeek(year: number, week: number): Promise<TmsWeekData> {
    // TODO: call the TMS API and map its response into TmsWeekData.
    // Example:
    //   const res = await fetch(`${this.baseUrl}/weeks/${year}/${week}`, {
    //     headers: { Authorization: `Bearer ${process.env.TMS_API_TOKEN}` },
    //   });
    //   const raw = await res.json();
    //   return { drivers: raw.map(mapTmsDriver) };
    throw new Error(
      `HttpTmsSource.getWeek(${year}, ${week}) not implemented — map the TMS ` +
        'API response to TmsWeekData.'
    );
  }
}

export function getTmsSource(): TmsSource {
  const baseUrl = process.env.TMS_API_URL;
  return baseUrl ? new HttpTmsSource(baseUrl) : new NotConfiguredTmsSource();
}
