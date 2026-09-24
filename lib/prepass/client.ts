// Prepass API client. Node-only (external HTTP + used by the DB sync).
// Auth: OAuth2 client credentials (form-urlencoded) → { access_token }.

const TOKEN_URL = process.env.PREPASS_TOKEN_URL;
const API_URL = process.env.PREPASS_API_URL;

export interface TollTransaction {
  tollId: number;
  accountNumber: number | null;
  accountName: string | null;
  postDateTime: string | null;
  invoiceDateTime: string | null;
  /** When the vehicle exited the plaza (client week + assignment date). */
  exitDateTime: string | null;
  vehicleNumber: string | null;
  deviceNumber: string | null;
  tollAgencyCode: string | null;
  tollAgencyName: string | null;
  tollAgencyState: string | null;
  exitPlazaName: string | null;
  tollClass: string | null;
  tollCharge: number | null;
  tollCategory: string | null;
  [key: string]: unknown;
}

/** OAuth2 client-credentials token grant. */
export async function getAccessToken(): Promise<string> {
  const clientId = process.env.PREPASS_CLIENT_ID;
  const clientSecret = process.env.PREPASS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('PREPASS_CLIENT_ID and PREPASS_CLIENT_SECRET must be set');
  }
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
  });
  if (process.env.PREPASS_SCOPE) body.set('scope', process.env.PREPASS_SCOPE);

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      client_id: clientId,
      client_secret: clientSecret,
    },
    body,
  });
  if (!res.ok) {
    throw new Error(`Prepass auth failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) {
    throw new Error('Prepass auth response had no access_token');
  }
  return json.access_token;
}

/** Fetch all toll transactions for a date range + account(s), following paging. */
export async function fetchTollTransactions(
  token: string,
  params: { startPostDate: string; endPostDate: string; accountNumbers: string }
): Promise<TollTransaction[]> {
  const all: TollTransaction[] = [];
  let pageNumber = 1;
  let totalPages = 1;

  do {
    const url = new URL(API_URL);
    url.searchParams.set('startPostDate', params.startPostDate);
    url.searchParams.set('endPostDate', params.endPostDate);
    url.searchParams.set('accountNumbers', params.accountNumbers);
    if (pageNumber > 1) url.searchParams.set('pageNumber', String(pageNumber));

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new Error(
        `Prepass transactions failed: ${res.status} ${await res.text()}`
      );
    }
    const json = (await res.json()) as {
      transactions?: TollTransaction[];
      pageInfo?: { totalPages?: number };
    };
    all.push(...(json.transactions ?? []));
    totalPages = json.pageInfo?.totalPages ?? 1;
    pageNumber += 1;
  } while (pageNumber <= totalPages);

  return all;
}
