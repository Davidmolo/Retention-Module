import type { RowDataPacket } from 'mysql2';
import { getPool } from '../db';

// Read side for the assignments (driver ↔ truck) section. Joins the roster +
// trucks for display. Read-only; TMS is the source of truth.

export interface AssignmentRow {
  id: number;
  driverName: string | null;
  truckUnit: string | null;
  truckMake: string | null;
  truckModel: string | null;
  type: string | null;
  startDate: string | null;
  endDate: string | null; // null = currently assigned
}

interface AssignmentRecord extends RowDataPacket, AssignmentRow {}

const DRIVER_NAME = `TRIM(CONCAT_WS(' ', d.first_name, d.last_name))`;
const SELECT_COLS = `a.id,
  ${DRIVER_NAME} AS driverName,
  t.unit AS truckUnit, t.make AS truckMake, t.model AS truckModel,
  a.assignment_type AS type,
  DATE_FORMAT(a.start_date, '%Y-%m-%d') AS startDate,
  DATE_FORMAT(a.end_date, '%Y-%m-%d') AS endDate`;

export interface PagedAssignments {
  assignments: AssignmentRow[];
  total: number;
}

/** Server-side paginated + searched assignments; current (open) ones first. */
export async function listAssignmentsPaged(opts: {
  search?: string;
  currentOnly?: boolean;
  limit: number;
  offset: number;
}): Promise<PagedAssignments> {
  const pool = getPool();
  const params: (string | number)[] = [];
  const conds: string[] = [];
  const q = opts.search?.trim();
  if (q) {
    conds.push(`(${DRIVER_NAME} LIKE ? OR t.unit LIKE ?)`);
    params.push(`%${q}%`, `%${q}%`);
  }
  if (opts.currentOnly) conds.push('a.end_date IS NULL');
  const clause = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const from = `FROM assignments a
    LEFT JOIN drivers d ON d.id = a.driver_id
    LEFT JOIN trucks t ON t.id = a.truck_id
    ${clause}`;

  const [countRows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total ${from}`,
    params
  );
  const total = Number(countRows[0].total);

  const limit = Math.max(1, Math.floor(opts.limit));
  const offset = Math.max(0, Math.floor(opts.offset));
  const [rows] = await pool.query<AssignmentRecord[]>(
    `SELECT ${SELECT_COLS} ${from}
      ORDER BY (a.end_date IS NULL) DESC, a.start_date DESC
      LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  return {
    assignments: rows.map((r) => ({
      id: r.id,
      driverName: r.driverName,
      truckUnit: r.truckUnit,
      truckMake: r.truckMake,
      truckModel: r.truckModel,
      type: r.type,
      startDate: r.startDate,
      endDate: r.endDate,
    })),
    total,
  };
}
