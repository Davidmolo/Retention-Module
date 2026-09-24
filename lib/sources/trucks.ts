import type { RowDataPacket } from 'mysql2';
import { getPool } from '../db';

// Read side for the trucks roster (table `trucks` = OpenRoad TMS trucks, synced
// by lib/openroad/trucks.ts). Read-only; TMS is the source of truth.

export interface TruckRow {
  id: number;
  unit: string | null;
  status: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  vin: string | null;
  licensePlate: string | null;
  stateCode: string | null;
  ownershipType: string | null;
}

interface TruckRecord extends RowDataPacket, TruckRow {}

const SELECT_COLS = `id, unit, status, make, model, year, vin,
  license_plate AS licensePlate, state_code AS stateCode, ownership_type AS ownershipType`;

export interface PagedTrucks {
  trucks: TruckRow[];
  total: number;
}

/** Distinct truck statuses (for the filter dropdown). */
export async function getTruckStatuses(): Promise<string[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT DISTINCT status FROM trucks
      WHERE status IS NOT NULL AND status <> ''
      ORDER BY status`
  );
  return rows.map((r) => r.status as string);
}

/** Server-side paginated + searched + status-filtered trucks roster. */
export async function listTrucksPaged(opts: {
  search?: string;
  status?: string;
  limit: number;
  offset: number;
}): Promise<PagedTrucks> {
  const pool = getPool();
  const params: (string | number)[] = [];
  const conds: string[] = [];
  const q = opts.search?.trim();
  if (q) {
    conds.push('(unit LIKE ? OR vin LIKE ? OR make LIKE ? OR model LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  const status = opts.status?.trim();
  if (status) {
    conds.push('status = ?');
    params.push(status);
  }
  const clause = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  const [countRows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM trucks ${clause}`,
    params
  );
  const total = Number(countRows[0].total);

  const limit = Math.max(1, Math.floor(opts.limit));
  const offset = Math.max(0, Math.floor(opts.offset));
  const [rows] = await pool.query<TruckRecord[]>(
    `SELECT ${SELECT_COLS} FROM trucks ${clause}
      ORDER BY LENGTH(unit), unit
      LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  return {
    trucks: rows.map((r) => ({
      id: r.id,
      unit: r.unit,
      status: r.status,
      make: r.make,
      model: r.model,
      year: r.year,
      vin: r.vin,
      licensePlate: r.licensePlate,
      stateCode: r.stateCode,
      ownershipType: r.ownershipType,
    })),
    total,
  };
}
