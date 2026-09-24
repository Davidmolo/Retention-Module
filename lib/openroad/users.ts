import type { ResultSetHeader } from 'mysql2';
import { getPool } from '../db';
import { fetchPage } from './client';
import { toSqlDateTime } from '../dates';

// OpenRoad TMS users (dispatchers / managers). drivers.manager_id → tms_users.id

const USERS_URL = process.env.OPENROAD_USERS_URL;

export interface TmsUserRecord {
  id?: number;
  name?: string | null;
  lastname?: string | null;
  type?: string | null;
  status?: string | null;
  email?: string | null;
  phone?: string | null;
  office?: string | null;
  team?: string | null;
  created_at?: unknown;
  updated_at?: unknown;
  [key: string]: unknown;
}

const COLS = [
  'id',
  'first_name',
  'last_name',
  'user_type',
  'status',
  'email',
  'phone',
  'office',
  'team',
  'source_created_at',
  'source_updated_at',
];

const UPSERT_SQL =
  `INSERT INTO tms_users (${COLS.join(', ')}) VALUES ? ` +
  `ON DUPLICATE KEY UPDATE ` +
  COLS.filter((c) => c !== 'id').map((c) => `${c}=VALUES(${c})`).join(', ');

function rowOf(u: TmsUserRecord): unknown[] {
  return [
    u.id,
    u.name ?? null,
    u.lastname ?? null,
    u.type ?? null,
    u.status ?? null,
    u.email ?? null,
    u.phone ?? null,
    u.office ?? null,
    u.team ?? null,
    toSqlDateTime(u.created_at),
    toSqlDateTime(u.updated_at),
  ];
}

export async function upsertTmsUsers(
  users: TmsUserRecord[]
): Promise<{ stored: number; skipped: number }> {
  const rows = users.filter((u) => u.id != null).map(rowOf);
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
        console.warn(`  skip TMS user id=${row[0]}: ${(e as Error).message}`);
      }
    }
    return { stored, skipped };
  }
}

export interface TmsUserSyncResult {
  fetched: number;
  stored: number;
  skipped: number;
  pages: number;
}

/** Paginate full OpenRoad users list into tms_users. */
export async function syncTmsUsers(): Promise<TmsUserSyncResult> {
  if (!USERS_URL) {
    throw new Error('OPENROAD_USERS_URL must be set');
  }
  const perPage = Math.max(1, Number(process.env.OPENROAD_PER_PAGE || 100));
  const MAX_PAGES = 100_000;
  let page = 1;
  const result: TmsUserSyncResult = { fetched: 0, stored: 0, skipped: 0, pages: 0 };

  while (page <= MAX_PAGES) {
    const { items, lastPage } = await fetchPage(USERS_URL, page, perPage);
    result.pages += 1;
    if (!items.length) break;

    result.fetched += items.length;
    const { stored, skipped } = await upsertTmsUsers(items as TmsUserRecord[]);
    result.stored += stored;
    result.skipped += skipped;

    if (lastPage != null && page >= lastPage) break;
    if (items.length < perPage) break;
    page += 1;
  }

  return result;
}
