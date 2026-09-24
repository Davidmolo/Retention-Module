import type { ResultSetHeader } from 'mysql2';
import { getPool } from '../db';
import { fetchPage } from './client';
import { toSqlDateTime } from '../dates';

// OpenRoad TMS compensations = driver pay structures (Per Mile / Percentage /
// Flat). drivers.compensation_id links to these. Paginate + upsert by id.

const COMPENSATIONS_URL = process.env.OPENROAD_COMPENSATIONS_URL;

interface CompensationRecord {
  id?: number;
  updated_at?: unknown;
  seniority_bonus_excluded_event_reasons?: unknown;
  [key: string]: unknown;
}

const COLS = [
  'id', 'name', 'status', 'loaded_mile_rate', 'empty_mile_rate', 'banded',
  'linehaul_percentage', 'fuel_surcharge_percentage', 'flat_status', 'flat_rate',
  'seniority_bonus_enabled', 'seniority_bonus_cents_per_mile_per_year',
  'seniority_bonus_excluded_event_reasons', 'source_created_at', 'source_updated_at',
];

const UPSERT_SQL =
  `INSERT INTO compensations (${COLS.join(', ')}) VALUES ? ` +
  `ON DUPLICATE KEY UPDATE ` +
  COLS.filter((c) => c !== 'id').map((c) => `${c}=VALUES(${c})`).join(', ');

function rowOf(x: CompensationRecord): unknown[] {
  const reasons = x.seniority_bonus_excluded_event_reasons;
  return [
    x.id, x.name ?? null, x.status ?? null, x.loaded_mile_rate ?? null,
    x.empty_mile_rate ?? null, x.banded ?? null, x.linehaul_percentage ?? null,
    x.fuel_surcharge_percentage ?? null, x.flat_status ?? null, x.flat_rate ?? null,
    x.seniority_bonus_enabled ?? null,
    x.seniority_bonus_cents_per_mile_per_year ?? null,
    Array.isArray(reasons) ? JSON.stringify(reasons) : null,
    toSqlDateTime(x.created_at), toSqlDateTime(x.updated_at),
  ];
}

export async function upsertCompensations(
  comps: CompensationRecord[]
): Promise<{ stored: number; skipped: number }> {
  const rows = comps.filter((x) => x.id != null).map(rowOf);
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
        console.warn(`  skip compensation id=${row[0]}: ${(e as Error).message}`);
      }
    }
    return { stored, skipped };
  }
}

export interface CompensationSyncResult {
  fetched: number;
  stored: number;
  skipped: number;
  pages: number;
}

export async function syncTmsCompensations(): Promise<CompensationSyncResult> {
  const perPage = Math.max(1, Number(process.env.OPENROAD_PER_PAGE || 100));
  const MAX_PAGES = 100_000;
  let page = 1;
  const result: CompensationSyncResult = { fetched: 0, stored: 0, skipped: 0, pages: 0 };

  while (page <= MAX_PAGES) {
    const { items, lastPage } = await fetchPage(COMPENSATIONS_URL, page, perPage);
    result.pages += 1;
    if (!items.length) break;

    result.fetched += items.length;
    const { stored, skipped } = await upsertCompensations(items as CompensationRecord[]);
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
