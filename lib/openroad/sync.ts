import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { getPool } from '../db';
import { fetchDriversPage, type TmsDriver } from './client';
import { toSqlDate as toDate, toSqlDateTime as toDateTime } from '../dates';

function isOpenRoadActive(status: string | null | undefined): boolean {
  return String(status || '').trim().toLowerCase() === 'active';
}

const COLS = [
  'id', 'first_name', 'last_name', 'middle_name', 'driver_nr', 'status',
  'driver_type', 'tax_type', 'fleet_group', 'manager_id', 'substitute_manager_id',
  'compensation_id', 'payroll_schedule_id', 'phone', 'email', 'cdl',
  'cdl_state', 'address', 'city', 'state_code', 'zipcode', 'dob', 'cdl_expire_date',
  'date_added', 'date_removed', 'source_created_at', 'source_updated_at',
];

const UPSERT_SQL =
  `INSERT INTO drivers (${COLS.join(', ')}) VALUES ? ` +
  `ON DUPLICATE KEY UPDATE ` +
  COLS.filter((c) => c !== 'id').map((c) => `${c}=VALUES(${c})`).join(', ');

// Row in the exact order of COLS.
function rowOf(d: TmsDriver): unknown[] {
  return [
    d.id, d.first_name ?? null, d.last_name ?? null, d.middle_name ?? null,
    d.driver_nr ?? null, d.status ?? null, d.driver_type ?? null, d.tax_type ?? null,
    d.fleet_group ?? null, d.manager_id ?? null, d.substitute_manager_id ?? null,
    d.compensation_id ?? null, d.payroll_schedule_id ?? null, d.phone ?? null,
    d.email ?? null, d.cdl ?? null, d.cdl_state ?? null,
    d.address ?? null, d.city ?? null, d.state_code ?? null, d.zipcode ?? null,
    toDate(d.dob), toDate(d.cdl_expire_date), toDate(d.date_added),
    toDate(d.date_removed), toDateTime(d.created_at), toDateTime(d.updated_at),
  ];
}

/**
 * Stamp reactivated_at when OpenRoad flips suspended/inactive → active
 * (vacation return). Retention treats them like a new driver for 7 days.
 */
async function markDriverReactivations(drivers: TmsDriver[]): Promise<void> {
  if (!drivers.length) return;
  const pool = getPool();
  const ids = drivers.map((d) => d.id).filter((id) => id != null);
  if (!ids.length) return;

  const [prevRows] = await pool.query<RowDataPacket[]>(
    `SELECT id, status FROM drivers WHERE id IN (?)`,
    [ids]
  );
  const prevStatus = new Map<number, string | null>();
  for (const r of prevRows) {
    prevStatus.set(Number(r.id), r.status != null ? String(r.status) : null);
  }

  const reactivated: number[] = [];
  for (const d of drivers) {
    const id = Number(d.id);
    if (!Number.isFinite(id) || !isOpenRoadActive(d.status)) continue;
    if (!prevStatus.has(id)) continue; // new hire — tenure gate handles it
    if (!isOpenRoadActive(prevStatus.get(id))) reactivated.push(id);
  }

  if (!reactivated.length) return;
  await pool.query(
    `UPDATE drivers SET reactivated_at = CURRENT_TIMESTAMP(3) WHERE id IN (?)`,
    [reactivated]
  );
  console.log(
    `[openroad] marked ${reactivated.length} driver(s) reactivated (→active)`
  );
}

/**
 * Upsert a batch of TMS drivers by id. If the batch fails (one bad row fails the
 * whole multi-row INSERT), retry row-by-row and skip the offenders so the sync
 * still completes.
 */
export async function upsertDrivers(
  drivers: TmsDriver[]
): Promise<{ stored: number; skipped: number }> {
  if (!drivers.length) return { stored: 0, skipped: 0 };
  const pool = getPool();
  await markDriverReactivations(drivers);
  const rows = drivers.map(rowOf);
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
        console.warn(`  skip TMS driver id=${row[0]}: ${(e as Error).message}`);
      }
    }
    return { stored, skipped };
  }
}

export interface TmsSyncResult {
  fetched: number;
  stored: number;
  skipped: number;
  pages: number;
}

/** Paginate the full drivers list and upsert every page. Idempotent by id. */
export async function syncTmsDrivers(): Promise<TmsSyncResult> {
  const perPage = Math.max(1, Number(process.env.OPENROAD_PER_PAGE || 100));
  const MAX_PAGES = 100_000; // runaway guard
  let page = 1;
  const result: TmsSyncResult = { fetched: 0, stored: 0, skipped: 0, pages: 0 };

  while (page <= MAX_PAGES) {
    const { drivers, lastPage } = await fetchDriversPage(page, perPage);
    result.pages += 1;
    if (!drivers.length) break;

    result.fetched += drivers.length;
    const { stored, skipped } = await upsertDrivers(drivers);
    result.stored += stored;
    result.skipped += skipped;

    // Stop on the reported last page, else when a short page comes back.
    if (lastPage != null) {
      if (page >= lastPage) break;
    } else if (drivers.length < perPage) {
      break;
    }
    page += 1;
  }
  return result;
}
