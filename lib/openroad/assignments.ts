import type { ResultSetHeader } from 'mysql2';
import { getPool } from '../db';
import { fetchPage } from './client';
import { toSqlDateTime } from '../dates';

// OpenRoad TMS assignments = the driver ↔ truck relation. Paginate the full list
// and upsert typed rows by id. Run AFTER the drivers + trucks syncs so the FK
// targets exist (the row-by-row fallback skips any assignment whose driver/truck
// isn't present).

const ASSIGNMENTS_URL = process.env.OPENROAD_ASSIGNMENTS_URL;

interface AssignmentRecord {
  id?: number;
  driver_id?: number | null;
  assignment_id?: number | null;
  assignment_type?: string | null;
  start_date?: unknown;
  end_date?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  [key: string]: unknown;
}

const COLS = [
  'id', 'driver_id', 'assignment_type', 'assignment_ref_id', 'truck_id',
  'start_date', 'end_date', 'source_created_at', 'source_updated_at',
];

const UPSERT_SQL =
  `INSERT INTO assignments (${COLS.join(', ')}) VALUES ? ` +
  `ON DUPLICATE KEY UPDATE ` +
  COLS.filter((c) => c !== 'id').map((c) => `${c}=VALUES(${c})`).join(', ');

function rowOf(a: AssignmentRecord): unknown[] {
  const isTruck = a.assignment_type === 'Truck';
  return [
    a.id,
    a.driver_id ?? null,
    a.assignment_type ?? null,
    a.assignment_id ?? null,
    isTruck ? a.assignment_id ?? null : null, // truck_id only for Truck assignments
    toSqlDateTime(a.start_date),
    toSqlDateTime(a.end_date),
    toSqlDateTime(a.created_at),
    toSqlDateTime(a.updated_at),
  ];
}

/** Upsert a batch of assignments by id; row-by-row fallback skips bad rows. */
export async function upsertAssignments(
  assignments: AssignmentRecord[]
): Promise<{ stored: number; skipped: number }> {
  const rows = assignments.filter((a) => a.id != null).map(rowOf);
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
        console.warn(`  skip assignment id=${row[0]}: ${(e as Error).message}`);
      }
    }
    return { stored, skipped };
  }
}

export interface AssignmentSyncResult {
  fetched: number;
  stored: number;
  skipped: number;
  pages: number;
}

export async function syncTmsAssignments(): Promise<AssignmentSyncResult> {
  const perPage = Math.max(1, Number(process.env.OPENROAD_PER_PAGE || 100));
  const MAX_PAGES = 100_000;
  let page = 1;
  const result: AssignmentSyncResult = { fetched: 0, stored: 0, skipped: 0, pages: 0 };

  while (page <= MAX_PAGES) {
    const { items, lastPage } = await fetchPage(ASSIGNMENTS_URL, page, perPage);
    result.pages += 1;
    if (!items.length) break;

    result.fetched += items.length;
    const { stored, skipped } = await upsertAssignments(items as AssignmentRecord[]);
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
