import type { RowDataPacket } from 'mysql2';
import { getPool } from '../db';

// Drivers roster = the OpenRoad TMS drivers (table `drivers`, synced daily and
// upserted by TMS id). Read-only here; TMS is the source of truth. `name` is
// derived from first/middle/last.

export interface DriverRow {
  id: number;
  name: string;
  driverNr: string | null;
  status: string | null;
  driverType: string | null;
  phone: string | null;
  email: string | null;
}

interface DriverRecord extends RowDataPacket {
  id: number;
  name: string;
  driverNr: string | null;
  status: string | null;
  driverType: string | null;
  phone: string | null;
  email: string | null;
}

const NAME_SQL = `TRIM(CONCAT_WS(' ', first_name, middle_name, last_name))`;

const SELECT_COLS = `id, ${NAME_SQL} AS name, driver_nr AS driverNr, status,
  driver_type AS driverType, phone, email`;

export interface PagedDrivers {
  drivers: DriverRow[];
  total: number;
}

/** Distinct driver statuses (for the filter dropdown). */
export async function getDriverStatuses(): Promise<string[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT DISTINCT status FROM drivers
      WHERE status IS NOT NULL AND status <> ''
      ORDER BY status`
  );
  return rows.map((r) => r.status as string);
}

/** Server-side paginated + searched + status-filtered roster. */
export async function listDriversPaged(opts: {
  search?: string;
  status?: string;
  limit: number;
  offset: number;
}): Promise<PagedDrivers> {
  const pool = getPool();
  const params: (string | number)[] = [];
  const conds: string[] = [];
  const q = opts.search?.trim();
  if (q) {
    conds.push(`(${NAME_SQL} LIKE ? OR driver_nr LIKE ? OR status LIKE ?)`);
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  const status = opts.status?.trim();
  if (status) {
    conds.push('status = ?');
    params.push(status);
  }
  const clause = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  const [countRows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM drivers ${clause}`,
    params
  );
  const total = Number(countRows[0].total);

  const limit = Math.max(1, Math.floor(opts.limit));
  const offset = Math.max(0, Math.floor(opts.offset));
  const [rows] = await pool.query<DriverRecord[]>(
    `SELECT ${SELECT_COLS} FROM drivers ${clause} ORDER BY name LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  return {
    drivers: rows.map((r) => ({
      id: r.id,
      name: r.name,
      driverNr: r.driverNr,
      status: r.status,
      driverType: r.driverType,
      phone: r.phone,
      email: r.email,
    })),
    total,
  };
}
