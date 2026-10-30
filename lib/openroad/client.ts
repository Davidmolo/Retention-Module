// OpenRoad TMS API client. Node-only (external HTTP + used by the DB sync).
// Auth: HTTP Basic (username/password from env).

import dns from 'dns';
import https from 'https';
import { Resolver } from 'dns/promises';

// Some Windows DNS resolvers flake on app.openroadtms.com (EAI_AGAIN).
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {
  /* ignore if locked down */
}

const DRIVERS_URL = process.env.OPENROAD_DRIVERS_URL;

export interface TmsDriver {
  id: number;
  first_name: string | null;
  last_name: string | null;
  middle_name: string | null;
  driver_nr: string | null;
  status: string | null;
  driver_type: string | null;
  tax_type: string | null;
  fleet_group: string | null;
  manager_id: number | null;
  substitute_manager_id: number | null;
  compensation_id: number | null;
  payroll_schedule_id: number | null;
  phone: string | null;
  email: string | null;
  cdl: string | null;
  cdl_state: string | null;
  address: string | null;
  city: string | null;
  state_code: string | null;
  zipcode: string | null;
  dob: string | null;
  cdl_expire_date: string | null;
  date_added: string | null;
  date_removed: string | null;
  created_at: string | null;
  updated_at: string | null;
  [key: string]: unknown;
}

function authHeader(): string {
  const user = process.env.OPENROAD_API_USERNAME;
  const pass = process.env.OPENROAD_API_PASSWORD;
  if (!user || !pass) {
    throw new Error('OPENROAD_API_USERNAME and OPENROAD_API_PASSWORD must be set');
  }
  return 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
}

// The list may come back as a bare array or wrapped (data/drivers/trucks/…).
function extractArray(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  const obj = json as Record<string, unknown>;
  for (const key of ['data', 'drivers', 'trucks', 'users', 'results', 'items', 'driver_routes']) {
    if (Array.isArray(obj?.[key])) return obj[key] as unknown[];
  }
  return [];
}

// Read a "last page" hint from common pagination envelopes, if present.
function extractLastPage(json: unknown): number | null {
  const obj = json as Record<string, any>;
  const candidates = [
    obj?.meta?.last_page,
    obj?.meta?.total_pages,
    obj?.last_page,
    obj?.total_pages,
    obj?.pagination?.total_pages,
  ];
  const n = candidates.find((v) => typeof v === 'number');
  if (typeof n === 'number') return n;
  const total = Number(obj?.meta?.total);
  const perPage = Number(obj?.meta?.per_page);
  if (Number.isFinite(total) && Number.isFinite(perPage) && perPage > 0) {
    return Math.max(1, Math.ceil(total / perPage));
  }
  return null;
}

/** Generic paged GET against an OpenRoad list endpoint. */
export async function fetchPage(
  baseUrl: string | undefined,
  page: number,
  perPage: number,
  sort?: string
): Promise<{ items: unknown[]; lastPage: number | null }> {
  if (!baseUrl) throw new Error('OpenRoad endpoint URL must be set');
  const url = new URL(baseUrl);
  url.searchParams.set('page', String(page));
  url.searchParams.set('per_page', String(perPage));
  if (sort) url.searchParams.set('sort', sort);

  const json = await openRoadGet(url.toString());
  return { items: extractArray(json), lastPage: extractLastPage(json) };
}

const dnsResolver = new Resolver();
dnsResolver.setServers(['8.8.8.8', '1.1.1.1']);
const ipCache = new Map<string, { ip: string; at: number }>();

async function hostIp(hostname: string): Promise<string> {
  const hit = ipCache.get(hostname);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.ip;
  const ips = await dnsResolver.resolve4(hostname);
  const ip = ips[0];
  if (!ip) throw new Error(`No address for ${hostname}`);
  ipCache.set(hostname, { ip, at: Date.now() });
  return ip;
}

/** GET JSON. Resolves OpenRoad through public DNS because the local resolver flakes. */
async function openRoadGet(urlString: string): Promise<unknown> {
  const url = new URL(urlString);
  const ip = await hostIp(url.hostname);
  const text = await new Promise<string>((resolve, reject) => {
    const req = https.request(
      {
        host: ip,
        servername: url.hostname,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        headers: {
          Host: url.hostname,
          Authorization: authHeader(),
          Accept: 'application/json',
          'User-Agent': 'grossprofit-sync/1.0',
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk as Buffer));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          if ((res.statusCode ?? 500) >= 400) {
            reject(new Error(`OpenRoad fetch failed: ${res.statusCode} ${body.slice(0, 200)}`));
            return;
          }
          resolve(body);
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
  return JSON.parse(text) as unknown;
}

/** GET one OpenRoad resource URL; returns parsed JSON body. */
export async function fetchOpenRoadJson(url: string): Promise<unknown> {
  return openRoadGet(url);
}

export async function fetchDriversPage(
  page: number,
  perPage: number
): Promise<{ drivers: TmsDriver[]; lastPage: number | null }> {
  const { items, lastPage } = await fetchPage(DRIVERS_URL, page, perPage, '-updated_at');
  return { drivers: items as TmsDriver[], lastPage };
}
