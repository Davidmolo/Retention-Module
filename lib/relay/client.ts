// Relay Payments TMS Fuel API. Node-only.
// Auth: API key in the Authorization header (raw key, not Bearer).
// Docs: https://docs.relaypayments.com (spec tmsfuel.yaml)

const DEFAULT_BASE = 'https://app.relaypayments.com/api';

export interface RelayFuelDriver {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  email?: string | null;
  /** Acts as the fuel card # in TMS. */
  integration_id?: string | null;
}

export interface RelayFuelItem {
  fuel_type?: string | null;
  volume?: string | null;
  retail_price_per_unit?: string | null;
  discounted_price_per_unit?: string | null;
  total_retail_price?: string | null;
  total_discounted_price?: string | null;
}

export interface RelayFuelTransaction {
  transaction_id: string;
  created_at: string;
  total_amount_paid: string;
  total_retail_price: string;
  total_amount_saved: string;
  driver: RelayFuelDriver;
  fuel_items?: RelayFuelItem[];
}

function apiBase(): string {
  return (process.env.RELAY_API_URL || DEFAULT_BASE).replace(/\/$/, '');
}

function apiKey(): string {
  const key = process.env.RELAY_API_KEY?.trim();
  if (!key) throw new Error('RELAY_API_KEY must be set');
  return key;
}

/** Fetch fuel transactions for [dtstart, dtend) in RFC3339. */
export async function fetchFuelTransactions(range: {
  dtstart: string;
  dtend: string;
}): Promise<RelayFuelTransaction[]> {
  const url = new URL(`${apiBase()}/fuel/transactions/`);
  url.searchParams.set('dtstart', range.dtstart);
  url.searchParams.set('dtend', range.dtend);

  const res = await fetch(url, {
    headers: { Authorization: apiKey(), Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(
      `Relay fuel transactions failed: ${res.status} ${await res.text()}`
    );
  }
  const json = (await res.json()) as RelayFuelTransaction[];
  return Array.isArray(json) ? json : [];
}
