import type { ResultSetHeader } from 'mysql2';
import { getPool } from '../db';
import { fetchPage } from './client';
import { toSqlDate, toSqlDateTime } from '../dates';

// OpenRoad TMS trucks sync. Mirrors the drivers sync: Basic auth, paginate the
// full list, upsert typed columns by id, daily cron.

const TRUCKS_URL = process.env.OPENROAD_TRUCKS_URL;

interface TruckRecord {
  id?: number;
  updated_at?: unknown;
  [key: string]: unknown;
}

const COLS = [
  'id', 'unit', 'status', 'make', 'model', 'year', 'vin', 'license_plate',
  'state_code', 'ownership_type', 'color', 'insured_value', 'oos', 'needs_repair',
  'slip_seating', 'oos_note', 'needs_repair_note', 'irp', 'lease', 'samsara_dev_id',
  'monthly_insurance_cost', 'total_insurance_cost', 'cost', 'monthly_payment',
  'interest', 'acquisition_date', 'annual_inspection_date', 'irp_expiration_date',
  'ins_expiration_date', 'irp_add_date', 'irp_remove_date', 'quarterly_maintenance_date',
  'source_created_at', 'source_updated_at',
];

const UPSERT_SQL =
  `INSERT INTO trucks (${COLS.join(', ')}) VALUES ? ` +
  `ON DUPLICATE KEY UPDATE ` +
  COLS.filter((c) => c !== 'id').map((c) => `${c}=VALUES(${c})`).join(', ');

// Row in the exact order of COLS. `?? null` preserves booleans (false) and
// passes decimals through as strings (MySQL coerces); dates are sanitized.
function rowOf(t: TruckRecord): unknown[] {
  return [
    t.id, t.unit ?? null, t.status ?? null, t.make ?? null, t.model ?? null,
    t.year ?? null, t.vin ?? null, t.license_plate ?? null, t.state_code ?? null,
    t.ownership_type ?? null, t.color ?? null, t.insured_value ?? null,
    t.oos ?? null, t.needs_repair ?? null, t.slip_seating ?? null,
    t.oos_note ?? null, t.needs_repair_note ?? null, t.irp ?? null, t.lease ?? null,
    t.samsara_dev_id ?? null, t.monthly_insurance_cost ?? null,
    t.total_insurance_cost ?? null, t.cost ?? null, t.monthly_payment ?? null,
    t.interest ?? null, toSqlDate(t.acquisition_date),
    toSqlDate(t.annual_inspection_date), toSqlDate(t.irp_expiration_date),
    toSqlDate(t.ins_expiration_date), toSqlDate(t.irp_add_date),
    toSqlDate(t.irp_remove_date), toSqlDate(t.quarterly_maintenance_date),
    toSqlDateTime(t.created_at), toSqlDateTime(t.updated_at),
  ];
}

/**
 * Upsert a batch of trucks by id. Falls back to row-by-row on batch failure so
 * one bad record can't abort the sync.
 */
export async function upsertTrucks(
  trucks: TruckRecord[]
): Promise<{ stored: number; skipped: number }> {
  const rows = trucks.filter((t) => t.id != null).map(rowOf);
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
        console.warn(`  skip TMS truck id=${row[0]}: ${(e as Error).message}`);
      }
    }
    return { stored, skipped };
  }
}

export interface TmsTruckSyncResult {
  fetched: number;
  stored: number;
  skipped: number;
  pages: number;
}

/** Paginate the full trucks list and upsert every page. Idempotent by id. */
export async function syncTmsTrucks(): Promise<TmsTruckSyncResult> {
  const perPage = Math.max(1, Number(process.env.OPENROAD_PER_PAGE || 100));
  const MAX_PAGES = 100_000; // runaway guard
  let page = 1;
  const result: TmsTruckSyncResult = { fetched: 0, stored: 0, skipped: 0, pages: 0 };

  while (page <= MAX_PAGES) {
    const { items, lastPage } = await fetchPage(TRUCKS_URL, page, perPage);
    result.pages += 1;
    if (!items.length) break;

    result.fetched += items.length;
    const { stored, skipped } = await upsertTrucks(items as TruckRecord[]);
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
