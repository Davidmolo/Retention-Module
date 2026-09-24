// Samsara API client. Node-only. Auth: Bearer token (scope "Read Fuel & Energy").

const BASE = process.env.SAMSARA_API_URL;

export interface FuelEnergyReport {
  vehicle?: { id?: string; name?: string; energyType?: string };
  driver?: { id?: string; name?: string };
  efficiencyMpge?: number | null;
  fuelConsumedMl?: number | null;
  distanceTraveledMeters?: number | null;
  [key: string]: unknown;
}

function authHeader(): string {
  const token = process.env.SAMSARA_API_TOKEN;
  if (!token) throw new Error('SAMSARA_API_TOKEN must be set');
  return `Bearer ${token}`;
}

/**
 * Fetch all fuel-energy reports for the date range (RFC 3339), following the
 * cursor pagination. `kind` is 'vehicles' or 'drivers'.
 */
export async function fetchFuelEnergy(
  kind: 'vehicles' | 'drivers',
  startDate: string,
  endDate: string
): Promise<FuelEnergyReport[]> {
  const listKey = kind === 'vehicles' ? 'vehicleReports' : 'driverReports';
  const all: FuelEnergyReport[] = [];
  let after: string | undefined;

  do {
    const url = new URL(`${BASE}/fleet/reports/${kind}/fuel-energy`);
    url.searchParams.set('startDate', startDate);
    url.searchParams.set('endDate', endDate);
    if (after) url.searchParams.set('after', after);

    const res = await fetch(url, {
      headers: { Authorization: authHeader(), Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(
        `Samsara ${kind} fuel-energy failed: ${res.status} ${await res.text()}`
      );
    }
    const json = (await res.json()) as {
      data?: Record<string, FuelEnergyReport[]>;
      pagination?: { endCursor?: string; hasNextPage?: boolean };
    };
    all.push(...(json.data?.[listKey] ?? []));
    after = json.pagination?.hasNextPage ? json.pagination.endCursor : undefined;
  } while (after);

  return all;
}
