import type { ResultSetHeader } from 'mysql2';
import { getPool } from '../db';
import { weekRange } from '../week';
import { fetchFuelEnergy } from './client';

/** Offset like "-06:00" for noon on that calendar day in the org timezone. */
function zoneOffset(ymd: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'longOffset',
  }).formatToParts(new Date(`${ymd}T12:00:00Z`));
  const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
  const match = name.match(/GMT([+-]\d{2}:\d{2})/);
  return match?.[1] ?? '-06:00';
}

/**
 * Same fuel-energy window as the FMS MPG coaching sheet
 * (admin-dashboard-backend/utils/samsaraWeek.js): Tuesday 00:00 through
 * Monday 00:00 in the org timezone. Samsara treats endDate as an inclusive
 * calendar date, so Monday midnight includes Monday and does not add Tuesday.
 */
/** Coaching sheet shows a dash when efficiency is missing or 0. */
function usableMpg(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100) / 100;
}

function coachingFuelWindow(start: string, end: string): {
  startDate: string;
  endDate: string;
} {
  const timeZone = process.env.SAMSARA_ORG_TIMEZONE?.trim() || 'America/Chicago';
  return {
    startDate: `${start}T00:00:00${zoneOffset(start, timeZone)}`,
    endDate: `${end}T00:00:00${zoneOffset(end, timeZone)}`,
  };
}

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
  // FMS coaching sheet: inclusive Chicago calendar dates, Monday at
  // 00:00 (not the next Tuesday, and not a UTC 23:59 window).
  const { startDate, endDate } = coachingFuelWindow(start, end);
  const pool = getPool();

  // Vehicles
  const vReports = await fetchFuelEnergy('vehicles', startDate, endDate);
  const vRows = vReports
    .filter((r) => r.vehicle?.id)
    .map((r) => [
      r.vehicle!.id, r.vehicle!.name ?? null, year, week, start, end,
      usableMpg(r.efficiencyMpge), r.fuelConsumedMl ?? null,
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
      usableMpg(r.efficiencyMpge), r.fuelConsumedMl ?? null,
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
