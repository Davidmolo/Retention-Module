import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { getPool } from '../db';

// Trips (loads) source. Rows live in the `trips` table (migration 003), populated
// by the TMS sync or an importer — both should call `insertTrips`. The dashboard
// "Top by Trips" chart reads `getTripCountsByDriver`.

export interface DriverTripCount {
  driverId: number | null; // roster id when linked
  driverName: string;
  tripCount: number;
}

export interface TripInput {
  externalId?: string | null; // dedupe key from the source system
  driverName: string;
  tripDate?: string | null; // 'YYYY-MM-DD'
  origin?: string | null;
  destination?: string | null;
  miles?: number | null;
  revenue?: number | null;
  source?: string; // 'tms' | 'import' | 'seed'
}

interface CountRow extends RowDataPacket {
  driverId: number | null;
  driverName: string;
  tripCount: number;
}

/** Trip count per driver, most trips first. Optional inclusive date range. */
export async function getTripCountsByDriver(range?: {
  start?: string;
  end?: string;
}): Promise<DriverTripCount[]> {
  const pool = getPool();
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (range?.start) {
    where.push('trip_date >= ?');
    params.push(range.start);
  }
  if (range?.end) {
    where.push('trip_date <= ?');
    params.push(range.end);
  }
  const clause = where.length
    ? `WHERE ${where.map((w) => `t.${w}`).join(' AND ')}`
    : '';
  const [rows] = await pool.query<CountRow[]>(
    `SELECT t.driver_id                     AS driverId,
            COALESCE(TRIM(CONCAT_WS(' ', d.first_name, d.middle_name, d.last_name)), t.driver_name) AS driverName,
            COUNT(*)                        AS tripCount
       FROM trips t
       LEFT JOIN drivers d ON t.driver_id = d.id
       ${clause}
      GROUP BY t.driver_id, COALESCE(TRIM(CONCAT_WS(' ', d.first_name, d.middle_name, d.last_name)), t.driver_name)
      ORDER BY tripCount DESC`,
    params
  );
  return rows.map((r) => ({
    driverId: r.driverId,
    driverName: r.driverName,
    tripCount: Number(r.tripCount),
  }));
}

/** Insert (or upsert by external_id) trip rows. Used by the TMS sync / importer. */
export async function insertTrips(trips: TripInput[]): Promise<number> {
  if (!trips.length) return 0;
  const pool = getPool();
  const rows = trips.map((t) => [
    t.externalId ?? null,
    t.driverName,
    t.tripDate ?? null,
    t.origin ?? null,
    t.destination ?? null,
    t.miles ?? null,
    t.revenue ?? null,
    t.source ?? 'import',
  ]);
  const [res] = await pool.query<ResultSetHeader>(
    `INSERT INTO trips
       (external_id, driver_name, trip_date, origin, destination, miles, revenue, source)
     VALUES ?
     ON DUPLICATE KEY UPDATE
       driver_name = VALUES(driver_name), trip_date = VALUES(trip_date),
       origin = VALUES(origin), destination = VALUES(destination),
       miles = VALUES(miles), revenue = VALUES(revenue), source = VALUES(source)`,
    [rows]
  );
  return res.affectedRows;
}
