import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { getPool } from '../db';
import { getAccessToken, fetchTollTransactions } from './client';

export interface TollSyncResult {
  start: string;
  end: string;
  fetched: number;
  stored: number; // rows inserted or updated
  linked: number; // rows newly linked to a truck
}

/** Set truck_id on tolls whose vehicle_number matches a truck's unit. */
export async function linkTollsToTrucks(): Promise<number> {
  const [res] = await getPool().query<ResultSetHeader>(
    `UPDATE toll_transactions tt
        JOIN trucks t ON t.unit = tt.vehicle_number
         SET tt.truck_id = t.id
       WHERE tt.truck_id IS NULL`
  );
  return res.affectedRows;
}

// "2026-06-23T03:24:41" -> "2026-06-23 03:24:41" (MySQL DATETIME); null/'' -> null
const toDateTime = (s: string | null | undefined): string | null =>
  s ? s.replace('T', ' ').slice(0, 19) : null;

const INSERT_COLS =
  '(toll_id, account_number, account_name, post_date, exit_date, invoice_date, ' +
  'vehicle_number, device_number, toll_agency_code, toll_agency_name, ' +
  'toll_agency_state, exit_plaza_name, toll_class, toll_charge, toll_category)';

const CHUNK = 500;

/** Auth to Prepass, fetch tolls for the range, and upsert them by tollId. */
export async function syncTolls(range: {
  start: string;
  end: string;
}): Promise<TollSyncResult> {
  const accountNumbers = process.env.PREPASS_ACCOUNT_NUMBERS || '364034';
  const token = await getAccessToken();
  const txns = await fetchTollTransactions(token, {
    startPostDate: range.start,
    endPostDate: range.end,
    accountNumbers,
  });
  if (!txns.length) return { ...range, fetched: 0, stored: 0, linked: 0 };

  const pool = getPool();
  const rows = txns.map((t) => [
    t.tollId,
    t.accountNumber ?? null,
    t.accountName ?? null,
    toDateTime(t.postDateTime),
    toDateTime(
      t.exitDateTime ??
        (typeof t.exitDate === 'string' ? t.exitDate : null)
    ),
    toDateTime(t.invoiceDateTime),
    t.vehicleNumber ?? null,
    t.deviceNumber ?? null,
    t.tollAgencyCode ?? null,
    t.tollAgencyName ?? null,
    t.tollAgencyState ?? null,
    t.exitPlazaName ?? null,
    t.tollClass ?? null,
    t.tollCharge ?? null,
    t.tollCategory ?? null,
  ]);

  let stored = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const [res] = await pool.query<ResultSetHeader>(
      `INSERT INTO toll_transactions ${INSERT_COLS} VALUES ?
       ON DUPLICATE KEY UPDATE
         account_number = VALUES(account_number), account_name = VALUES(account_name),
         post_date = VALUES(post_date), exit_date = VALUES(exit_date),
         invoice_date = VALUES(invoice_date),
         vehicle_number = VALUES(vehicle_number), device_number = VALUES(device_number),
         toll_agency_code = VALUES(toll_agency_code), toll_agency_name = VALUES(toll_agency_name),
         toll_agency_state = VALUES(toll_agency_state), exit_plaza_name = VALUES(exit_plaza_name),
         toll_class = VALUES(toll_class), toll_charge = VALUES(toll_charge),
         toll_category = VALUES(toll_category)`,
      [rows.slice(i, i + CHUNK)]
    );
    stored += res.affectedRows;
  }

  const linked = await linkTollsToTrucks();
  return { ...range, fetched: txns.length, stored, linked };
}

export interface VehicleToll {
  vehicleNumber: string;
  tollTotal: number;
  transactions: number;
}

/** SUM(toll_charge) per vehicle for a date range (inclusive, by exit date). */
export async function getTollsByVehicle(
  start: string,
  end: string
): Promise<VehicleToll[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT vehicle_number           AS vehicleNumber,
            SUM(toll_charge)          AS tollTotal,
            COUNT(*)                  AS transactions
       FROM toll_transactions
      WHERE DATE(COALESCE(exit_date, post_date)) BETWEEN ? AND ?
        AND vehicle_number IS NOT NULL AND vehicle_number <> ''
      GROUP BY vehicle_number
      ORDER BY tollTotal DESC`,
    [start, end]
  );
  return rows.map((r) => ({
    vehicleNumber: r.vehicleNumber,
    tollTotal: Number(r.tollTotal),
    transactions: Number(r.transactions),
  }));
}

export interface ListedTollTransaction {
  tollId: number;
  vehicleNumber: string | null;
  exitDate: string | null;
  postDate: string | null;
  agency: string | null;
  agencyState: string | null;
  plaza: string | null;
  tollClass: string | null;
  category: string | null;
  charge: number | null;
  deviceNumber: string | null;
  truckId: number | null;
}

export interface ListTollTransactionsResult {
  count: number;
  totalCharge: number;
  transactions: ListedTollTransaction[];
}

function fmtDateTime(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) {
    return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 19).replace('T', ' ');
  }
  const s = String(v).trim();
  if (!s) return null;
  return s.replace('T', ' ').slice(0, 19);
}

/**
 * Individual PrePass toll rows for a date range (inclusive),
 * bucketed by DATE(COALESCE(exit_date, post_date)) — same as PREPASS.
 */
export async function listTollTransactions(
  start: string,
  end: string,
  opts: { vehicleSearch?: string; limit?: number; offset?: number } = {}
): Promise<ListTollTransactionsResult> {
  const search = (opts.vehicleSearch ?? '').trim();
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
  const offset = Math.max(0, opts.offset ?? 0);

  const where = [
    'DATE(COALESCE(exit_date, post_date)) BETWEEN ? AND ?',
  ];
  const params: (string | number)[] = [start, end];
  if (search) {
    where.push('vehicle_number LIKE ?');
    params.push(`%${search}%`);
  }
  const whereSql = where.join(' AND ');

  const [aggRows] = await getPool().query<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt,
            COALESCE(SUM(toll_charge), 0) AS totalCharge
       FROM toll_transactions
      WHERE ${whereSql}`,
    params
  );
  const count = Number(aggRows[0]?.cnt ?? 0);
  const totalCharge = Number(aggRows[0]?.totalCharge ?? 0);

  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT toll_id AS tollId,
            vehicle_number AS vehicleNumber,
            exit_date AS exitDate,
            post_date AS postDate,
            toll_agency_name AS agency,
            toll_agency_state AS agencyState,
            exit_plaza_name AS plaza,
            toll_class AS tollClass,
            toll_category AS category,
            toll_charge AS charge,
            device_number AS deviceNumber,
            truck_id AS truckId
       FROM toll_transactions
      WHERE ${whereSql}
      ORDER BY COALESCE(exit_date, post_date) DESC, toll_id DESC
      LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return {
    count,
    totalCharge,
    transactions: rows.map((r) => ({
      tollId: Number(r.tollId),
      vehicleNumber: r.vehicleNumber == null ? null : String(r.vehicleNumber),
      exitDate: fmtDateTime(r.exitDate),
      postDate: fmtDateTime(r.postDate),
      agency: r.agency == null ? null : String(r.agency),
      agencyState: r.agencyState == null ? null : String(r.agencyState),
      plaza: r.plaza == null ? null : String(r.plaza),
      tollClass: r.tollClass == null ? null : String(r.tollClass),
      category: r.category == null ? null : String(r.category),
      charge: r.charge == null ? null : Number(r.charge),
      deviceNumber: r.deviceNumber == null ? null : String(r.deviceNumber),
      truckId: r.truckId == null ? null : Number(r.truckId),
    })),
  };
}
