import type { ResultSetHeader } from 'mysql2';
import { getPool } from '../db';
import { fetchPage } from './client';
import { toSqlDateTimeUtc } from '../dates';

// OpenRoad TMS loads sync → `loads` table. The driver who ran a load is on its
// destinations[] (not the top level), so we extract it. Paginate + upsert by id.

const LOADS_URL = process.env.OPENROAD_LOADS_URL;

interface Destination {
  stop_type?: string;
  driver_id?: number | null;
}
interface LoadRecord {
  id?: number;
  status?: string | null;
  customer_name?: string | null;
  gp_load?: string | null;
  miles?: unknown;
  empty_miles_sum?: unknown;
  total?: unknown;
  linehaul_rate?: unknown;
  fuel_surcharge?: unknown;
  first_pu_time_from?: unknown;
  last_del_time_to?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  destinations?: Destination[];
  [key: string]: unknown;
}

// Prefer the delivery stop's driver, else any stop with a driver.
function loadDriverId(l: LoadRecord): number | null {
  const dests = Array.isArray(l.destinations) ? l.destinations : [];
  const delivery = dests.find((d) => d.stop_type === 'delivery' && d.driver_id != null);
  const any = dests.find((d) => d.driver_id != null);
  return (delivery?.driver_id ?? any?.driver_id) ?? null;
}

const COLS = [
  'id', 'driver_id', 'status', 'customer_name', 'gp_load', 'miles', 'empty_miles',
  'revenue', 'linehaul_rate', 'fuel_surcharge', 'pickup_at', 'delivery_at',
  'source_created_at', 'source_updated_at',
];

const UPSERT_SQL =
  `INSERT INTO loads (${COLS.join(', ')}) VALUES ? ` +
  `ON DUPLICATE KEY UPDATE ` +
  COLS.filter((c) => c !== 'id').map((c) => `${c}=VALUES(${c})`).join(', ');

function rowOf(l: LoadRecord): unknown[] {
  return [
    l.id, loadDriverId(l), l.status ?? null, l.customer_name ?? null,
    l.gp_load ?? null, l.miles ?? null, l.empty_miles_sum ?? null, l.total ?? null,
    l.linehaul_rate ?? null, l.fuel_surcharge ?? null,
    toSqlDateTimeUtc(l.first_pu_time_from), toSqlDateTimeUtc(l.last_del_time_to),
    toSqlDateTimeUtc(l.created_at), toSqlDateTimeUtc(l.updated_at),
  ];
}

export async function upsertLoads(
  loads: LoadRecord[]
): Promise<{ stored: number; skipped: number }> {
  const rows = loads.filter((l) => l.id != null).map(rowOf);
  if (!rows.length) return { stored: 0, skipped: 0 };
  const pool = getPool();
  try {
    const [res] = await pool.query<ResultSetHeader>(UPSERT_SQL, [rows]);
    return { stored: res.affectedRows, skipped: 0 };
  } catch {
    let stored = 0;
    let skipped = 0;
    for (const row of rows) {
      try {
        const [res] = await pool.query<ResultSetHeader>(UPSERT_SQL, [[row]]);
        stored += res.affectedRows;
      } catch (e) {
        skipped += 1;
        console.warn(`  skip load id=${row[0]}: ${(e as Error).message}`);
      }
    }
    return { stored, skipped };
  }
}

export interface LoadSyncResult {
  fetched: number;
  stored: number;
  skipped: number;
  pages: number;
}

export async function syncTmsLoads(): Promise<LoadSyncResult> {
  const perPage = Math.max(1, Number(process.env.OPENROAD_PER_PAGE || 100));
  const MAX_PAGES = 100_000;
  let page = 1;
  const result: LoadSyncResult = { fetched: 0, stored: 0, skipped: 0, pages: 0 };

  while (page <= MAX_PAGES) {
    const { items, lastPage } = await fetchPage(LOADS_URL, page, perPage, '-updated_at');
    result.pages += 1;
    if (!items.length) break;

    result.fetched += items.length;
    const { stored, skipped } = await upsertLoads(items as LoadRecord[]);
    result.stored += stored;
    result.skipped += skipped;

    if (lastPage != null) {
      if (page >= lastPage) break;
    } else if (items.length < perPage) {
      break;
    }
    page += 1;
  }
  return result;
}
