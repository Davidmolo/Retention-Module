import type { ResultSetHeader } from 'mysql2';
import { getPool } from '../db';
import { weekRange } from '../week';
import { fetchFuelEnergy } from './client';

// Pull weekly MPG (fuel efficiency) from Samsara for a given week and upsert one
// row per vehicle and per driver. Then link vehicles → trucks (by unit = name)
// and drivers → drivers roster (by name).

export interface SamsaraMpgSyncResult {
  year: number;
  week: number;
  vehicles: number;
  drivers: number;
  vehiclesLinked: number;
  driversLinked: number;
}

const VEH_SQL =
  `INSERT INTO samsara_vehicle_mpg
     (samsara_vehicle_id, vehicle_name, year, week, week_start, week_end,
      efficiency_mpge, fuel_consumed_ml, distance_meters, energy_type)
   VALUES ?
   ON DUPLICATE KEY UPDATE
     vehicle_name = VALUES(vehicle_name), week_start = VALUES(week_start),
     week_end = VALUES(week_end), efficiency_mpge = VALUES(efficiency_mpge),
     fuel_consumed_ml = VALUES(fuel_consumed_ml),
     distance_meters = VALUES(distance_meters), energy_type = VALUES(energy_type)`;

const DRV_SQL =
  `INSERT INTO samsara_driver_mpg
     (samsara_driver_id, driver_name, year, week, week_start, week_end,
      efficiency_mpge, fuel_consumed_ml, distance_meters)
   VALUES ?
   ON DUPLICATE KEY UPDATE
     driver_name = VALUES(driver_name), week_start = VALUES(week_start),
     week_end = VALUES(week_end), efficiency_mpge = VALUES(efficiency_mpge),
     fuel_consumed_ml = VALUES(fuel_consumed_ml),
     distance_meters = VALUES(distance_meters)`;

export async function syncSamsaraMpg(
  year: number,
  week: number
): Promise<SamsaraMpgSyncResult> {
  const { start, end } = weekRange(year, week);
  const startDate = `${start}T00:00:00Z`;
  const endDate = `${end}T23:59:59Z`;
  const pool = getPool();

  // Vehicles
  const vReports = await fetchFuelEnergy('vehicles', startDate, endDate);
  const vRows = vReports
    .filter((r) => r.vehicle?.id)
    .map((r) => [
      r.vehicle!.id, r.vehicle!.name ?? null, year, week, start, end,
      r.efficiencyMpge ?? null, r.fuelConsumedMl ?? null,
      r.distanceTraveledMeters ?? null, r.vehicle!.energyType ?? null,
    ]);
  if (vRows.length) await pool.query(VEH_SQL, [vRows]);
  const [vLink] = await pool.query<ResultSetHeader>(
    `UPDATE samsara_vehicle_mpg m JOIN trucks t ON t.unit = m.vehicle_name
        SET m.truck_id = t.id WHERE m.year = ? AND m.week = ?`,
    [year, week]
  );

  // Drivers
  const dReports = await fetchFuelEnergy('drivers', startDate, endDate);
  const dRows = dReports
    .filter((r) => r.driver?.id)
    .map((r) => [
      r.driver!.id, r.driver!.name ?? null, year, week, start, end,
      r.efficiencyMpge ?? null, r.fuelConsumedMl ?? null,
      r.distanceTraveledMeters ?? null,
    ]);
  if (dRows.length) await pool.query(DRV_SQL, [dRows]);
  const [dLink] = await pool.query<ResultSetHeader>(
    // Match "Abraham Y Lanz" ↔ first/last (middle optional); last-name LIKE fallback.
    `UPDATE samsara_driver_mpg m
        JOIN drivers d
          ON d.last_name IS NOT NULL
         AND TRIM(d.last_name) <> ''
         AND m.driver_name LIKE CONCAT('%', TRIM(d.last_name), '%')
         AND (
           TRIM(CONCAT_WS(' ', d.first_name, d.last_name)) = m.driver_name
           OR TRIM(CONCAT_WS(' ', d.first_name, d.middle_name, d.last_name)) = m.driver_name
           OR (
             d.first_name IS NOT NULL
             AND TRIM(d.first_name) <> ''
             AND m.driver_name LIKE CONCAT(TRIM(d.first_name), '%')
           )
         )
        SET m.driver_id = d.id
      WHERE m.year = ? AND m.week = ?
        AND m.driver_id IS NULL`,
    [year, week]
  );

  return {
    year, week,
    vehicles: vRows.length,
    drivers: dRows.length,
    vehiclesLinked: vLink.affectedRows,
    driversLinked: dLink.affectedRows,
  };
}
