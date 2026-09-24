import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { getPool } from '../db';
import { fetchOpenRoadJson, fetchPage } from './client';
import { toSqlDateTime } from '../dates';
import { weekRange } from '../week';

// OpenRoad /load_financials → load_financials + driver_accessorials.
// Docs: https://app.openroadtms.com/api-docs/ext/v1/index.html#/
// Driver accessorials carry settlement_week_start/end (payroll week paid).

const FINANCIALS_URL =
  process.env.OPENROAD_LOAD_FINANCIALS_URL ||
  'https://app.openroadtms.com/api/ext/v1/load_financials';

interface DriverAccessorial {
  id?: number;
  driver_id?: number | null;
  sum?: unknown;
  category?: string | null;
  note?: string | null;
  created_at?: unknown;
  settlement_status?: string | null;
  settlement_week_start?: string | null;
  settlement_week_end?: string | null;
  settlement_date?: string | null;
}

interface LoadFinancialRecord {
  id?: number;
  load_id?: number | null;
  customer_id?: number | null;
  status?: string | null;
  lumper_sum?: unknown;
  storage_sum?: unknown;
  misc_sum?: unknown;
  deductions_sum?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  additional_charges?: unknown[];
  driver_accessorials?: DriverAccessorial[];
  [key: string]: unknown;
}

const LF_COLS = [
  'id',
  'load_id',
  'customer_id',
  'status',
  'lumper_sum',
  'storage_sum',
  'misc_sum',
  'deductions_sum',
  'source_created_at',
  'source_updated_at',
];

const LF_SQL =
  `INSERT INTO load_financials (${LF_COLS.join(', ')}) VALUES ? ` +
  `ON DUPLICATE KEY UPDATE ` +
  LF_COLS.filter((c) => c !== 'id')
    .map((c) => `${c}=VALUES(${c})`)
    .join(', ');

const DA_COLS = [
  'id',
  'load_id',
  'driver_id',
  'amount',
  'category',
  'note',
  'settlement_status',
  'settlement_week_start',
  'settlement_week_end',
  'settlement_date',
  'source_created_at',
];

const DA_SQL =
  `INSERT INTO driver_accessorials (${DA_COLS.join(', ')}) VALUES ? ` +
  `ON DUPLICATE KEY UPDATE ` +
  DA_COLS.filter((c) => c !== 'id')
    .map((c) => `${c}=VALUES(${c})`)
    .join(', ');

function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toDate(v: unknown): string | null {
  if (v == null || v === '') return null;
  const s = String(v);
  // already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function lfRow(r: LoadFinancialRecord): unknown[] {
  const id = r.id ?? r.load_id;
  return [
    id,
    r.load_id ?? r.id ?? null,
    r.customer_id ?? null,
    r.status ?? null,
    num(r.lumper_sum),
    num(r.storage_sum),
    num(r.misc_sum),
    num(r.deductions_sum),
    toSqlDateTime(r.created_at),
    toSqlDateTime(r.updated_at),
  ];
}

function daRows(r: LoadFinancialRecord): unknown[][] {
  const loadId = Number(r.load_id ?? r.id);
  const list = Array.isArray(r.driver_accessorials) ? r.driver_accessorials : [];
  return list
    .filter((a) => a.id != null)
    .map((a) => [
      a.id,
      loadId,
      a.driver_id ?? null,
      num(a.sum) ?? 0,
      a.category ?? null,
      a.note ?? null,
      a.settlement_status ?? null,
      toDate(a.settlement_week_start),
      toDate(a.settlement_week_end),
      toDate(a.settlement_date),
      toSqlDateTime(a.created_at),
    ]);
}

export async function upsertLoadFinancials(
  records: LoadFinancialRecord[]
): Promise<{ stored: number; accessorials: number; skipped: number }> {
  const financials = records.filter((r) => (r.id ?? r.load_id) != null).map(lfRow);
  const accessorials = records.flatMap(daRows);
  if (!financials.length && !accessorials.length) {
    return { stored: 0, accessorials: 0, skipped: 0 };
  }

  const pool = getPool();
  let stored = 0;
  let accStored = 0;
  let skipped = 0;

  if (financials.length) {
    try {
      const [res] = await pool.query<ResultSetHeader>(LF_SQL, [financials]);
      stored = res.affectedRows;
    } catch {
      for (const row of financials) {
        try {
          const [res] = await pool.query<ResultSetHeader>(LF_SQL, [[row]]);
          stored += res.affectedRows;
        } catch (e) {
          skipped += 1;
          console.warn(`  skip load_financial id=${row[0]}: ${(e as Error).message}`);
        }
      }
    }
  }

  if (accessorials.length) {
    try {
      const [res] = await pool.query<ResultSetHeader>(DA_SQL, [accessorials]);
      accStored = res.affectedRows;
    } catch {
      for (const row of accessorials) {
        try {
          const [res] = await pool.query<ResultSetHeader>(DA_SQL, [[row]]);
          accStored += res.affectedRows;
        } catch (e) {
          skipped += 1;
          console.warn(
            `  skip driver_accessorial id=${row[0]}: ${(e as Error).message}`
          );
        }
      }
    }
  }

  return { stored, accessorials: accStored, skipped };
}

export interface LoadFinancialSyncResult {
  fetched: number;
  stored: number;
  accessorials: number;
  skipped: number;
  pages: number;
}

export async function syncTmsLoadFinancials(): Promise<LoadFinancialSyncResult> {
  const perPage = Math.max(1, Number(process.env.OPENROAD_PER_PAGE || 100));
  const MAX_PAGES = 100_000;
  let page = 1;
  const result: LoadFinancialSyncResult = {
    fetched: 0,
    stored: 0,
    accessorials: 0,
    skipped: 0,
    pages: 0,
  };

  while (page <= MAX_PAGES) {
    const { items, lastPage } = await fetchPage(
      FINANCIALS_URL,
      page,
      perPage,
      '-updated_at'
    );
    result.pages += 1;
    if (!items.length) break;

    result.fetched += items.length;
    const { stored, accessorials, skipped } = await upsertLoadFinancials(
      items as LoadFinancialRecord[]
    );
    result.stored += stored;
    result.accessorials += accessorials;
    result.skipped += skipped;

    if (page % 50 === 0) {
      console.log(
        `  load_financials page ${page}/${lastPage ?? '?'}: fetched=${result.fetched}`
      );
    }

    if (lastPage != null) {
      if (page >= lastPage) break;
    } else if (items.length < perPage) {
      break;
    }
    page += 1;
  }
  return result;
}

/**
 * Pull /load_financials for every load that can affect this week's report
 * (delivery week + Tue edge + routes in week). Used by generate:report so
 * driver_accessorials are fresh before pay is computed.
 */
export async function syncLoadFinancialsForWeek(
  year: number,
  week: number
): Promise<LoadFinancialSyncResult> {
  const { start, end } = weekRange(year, week);
  const pool = getPool();
  const [idRows] = await pool.query<RowDataPacket[]>(
    `SELECT DISTINCT id FROM (
        SELECT id FROM loads
         WHERE DATE(delivery_at) BETWEEN ? AND ?
            OR (
              DATE(delivery_at) = DATE_ADD(?, INTERVAL 1 DAY)
              AND pickup_at IS NOT NULL
              AND DATE(pickup_at) >= ?
              AND DATE(pickup_at) < ?
            )
        UNION
        SELECT load_id AS id FROM driver_routes
         WHERE load_id IS NOT NULL
           AND DATE(COALESCE(source_updated_at, source_created_at))
               BETWEEN ? AND ?
      ) x WHERE id IS NOT NULL`,
    [start, end, end, start, end, start, end]
  );
  const ids = idRows.map((r) => Number(r.id)).filter((id) => Number.isFinite(id));

  const result: LoadFinancialSyncResult = {
    fetched: 0,
    stored: 0,
    accessorials: 0,
    skipped: 0,
    pages: 0,
  };
  if (!ids.length) return result;

  const base = FINANCIALS_URL.replace(/\/$/, '');
  const chunk = 25;
  for (let i = 0; i < ids.length; i += chunk) {
    const batch = ids.slice(i, i + chunk);
    const records: LoadFinancialRecord[] = [];
    for (const id of batch) {
      try {
        const json = (await fetchOpenRoadJson(`${base}/${id}`)) as {
          data?: LoadFinancialRecord;
        };
        const rec = json?.data ?? (json as LoadFinancialRecord);
        if (rec && (rec.id != null || rec.load_id != null)) {
          records.push(rec);
          result.fetched += 1;
        }
      } catch (e) {
        result.skipped += 1;
        console.warn(
          `  skip load_financials/${id}: ${(e as Error).message}`
        );
      }
    }
    if (records.length) {
      const r = await upsertLoadFinancials(records);
      result.stored += r.stored;
      result.accessorials += r.accessorials;
      result.skipped += r.skipped;
    }
  }
  return result;
}
