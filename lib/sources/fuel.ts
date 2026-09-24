import type { RowDataPacket } from 'mysql2';
import { getPool } from '../db';

// Fuel source = the imported .dat transactions in `fuel_transactions`.
// Aggregated per driver for a date range → feeds the Fuel line of the sheet.

export interface FuelAggregate {
  driverId: number | null; // roster id when linked
  driverName: string;
  gallons: number;
  amount: number;
  pricePerGallon: number | null; // amount / gallons
}

interface FuelRow extends RowDataPacket {
  driverId: number | null;
  driverName: string;
  gallons: string | number;
  amount: string | number;
}

export async function getFuelByDriver(
  startDate: string, // 'YYYY-MM-DD' inclusive
  endDate: string // 'YYYY-MM-DD' inclusive
): Promise<FuelAggregate[]> {
  const pool = getPool();
  // Group by the canonical driver (driver_id) when linked, falling back to the
  // raw fuel name for any not-yet-linked rows.
  const [rows] = await pool.query<FuelRow[]>(
    `SELECT ft.driver_id                       AS driverId,
            COALESCE(TRIM(CONCAT_WS(' ', d.first_name, d.middle_name, d.last_name)), ft.driver_name)   AS driverName,
            COALESCE(SUM(ft.gallons), 0)       AS gallons,
            COALESCE(SUM(ft.amount), 0)        AS amount
       FROM fuel_transactions ft
       LEFT JOIN drivers d ON ft.driver_id = d.id
      WHERE ft.transaction_date BETWEEN ? AND ?
        AND COALESCE(TRIM(CONCAT_WS(' ', d.first_name, d.middle_name, d.last_name)), ft.driver_name) IS NOT NULL
        AND COALESCE(TRIM(CONCAT_WS(' ', d.first_name, d.middle_name, d.last_name)), ft.driver_name) <> ''
      GROUP BY ft.driver_id, COALESCE(TRIM(CONCAT_WS(' ', d.first_name, d.middle_name, d.last_name)), ft.driver_name)`,
    [startDate, endDate]
  );
  return rows.map((r) => {
    const gallons = Number(r.gallons);
    const amount = Number(r.amount);
    return {
      driverId: r.driverId,
      driverName: r.driverName,
      gallons,
      amount,
      pricePerGallon: gallons > 0 ? amount / gallons : null,
    };
  });
}
