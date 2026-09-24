/**
 * Live GP adapter — ready for MySQL (Gross Profit repo).
 *
 * Before merge: methods throw until bindLiveGpDb() is called.
 * After merge into D:\grossProfit:
 *   1. import { getPool } from "@/lib/db"
 *   2. bindLiveGpDb(getPool()) at app startup (e.g. instrumentation or first API call)
 *   3. GP_ADAPTER=live
 *
 * UI is unchanged — only data source swaps.
 */

import type { GpAdapter, SixWeekAverages } from "./types";
import { toGpDriver } from "./gpMapping";
import { getPool } from "@/lib/db";

export type LiveGpDb = {
  // mysql2 pool.query — keep loose so SELECT row shapes stay usable
  query: (sql: string, params?: unknown[]) => Promise<[any, any]>;
};

let db: LiveGpDb | null = null;

/** Call once from Gross Profit after merge if auto-bind is not enough: bindLiveGpDb(getPool()). */
export function bindLiveGpDb(pool: LiveGpDb) {
  db = pool;
}

function requireDb(): LiveGpDb {
  if (!db) {
    try {
      bindLiveGpDb(getPool());
    } catch {
      /* fall through */
    }
  }
  if (!db) {
    throw new Error(
      "liveGpAdapter: MySQL pool not bound. Set DATABASE_URL (same as Gross Profit) or call bindLiveGpDb(getPool())."
    );
  }
  return db;
}

const NAME_SQL = `TRIM(CONCAT_WS(' ', d.first_name, d.middle_name, d.last_name))`;

/**
 * Hire date for Retention (per OpenRoad guidance):
 * - Prefer created_at (source_created_at) = when the driver was created in OpenRoad
 *   → newly created ≈ newly hired
 * - Fall back to date_added if created_at is missing
 * - source_created_at is stored as America/Chicago wall time (see lib/dates.ts)
 * Status suspended→active may mean rehire or end of suspension; we only roster
 * true "active" drivers today (no status-history API wired yet).
 */
const HIRE_DATE_SQL = `COALESCE(
  DATE_FORMAT(d.source_created_at, '%Y-%m-%d'),
  DATE_FORMAT(d.date_added, '%Y-%m-%d')
)`;

const DRIVER_SELECT = `
  SELECT
    d.id,
    ${NAME_SQL} AS name,
    d.email,
    d.phone,
    d.driver_type AS driverType,
    d.status,
    ${HIRE_DATE_SQL} AS hireDate,
    DATE_FORMAT(d.dob, '%Y-%m-%d') AS birthDate,
    NULLIF(TRIM(CONCAT_WS(' ', mgr.first_name, mgr.last_name)), '') AS dispatcher,
    c.loaded_mile_rate AS cpm
  FROM drivers d
  LEFT JOIN compensations c ON c.id = d.compensation_id
  LEFT JOIN tms_users mgr ON mgr.id = d.manager_id
`;

export const liveGpAdapter: GpAdapter = {
  name: "live",

  async listDrivers({ includeInactive = false } = {}) {
    const pool = requireDb();
    // Retention / live roster: only OpenRoad status = 'active' (not suspended).
    const where = includeInactive
      ? ""
      : ` WHERE d.status IS NOT NULL AND LOWER(TRIM(d.status)) = 'active'`;
    const [rows] = await pool.query(
      `${DRIVER_SELECT}${where} ORDER BY name`
    );
    return (rows as Record<string, unknown>[]).map((r) =>
      toGpDriver({
        id: r.id as number,
        name: String(r.name || ""),
        email: (r.email as string) || null,
        phone: (r.phone as string) || null,
        driverType: (r.driverType as string) || null,
        status: (r.status as string) || null,
        hireDate: (r.hireDate as string) || null,
        birthDate: (r.birthDate as string) || null,
        dispatcher: (r.dispatcher as string) || null,
        cpm: r.cpm == null ? null : Number(r.cpm),
      })
    );
  },

  async getDriver(driverId: string) {
    const pool = requireDb();
    const [rows] = await pool.query(
      `${DRIVER_SELECT} WHERE d.id = ? LIMIT 1`,
      [driverId]
    );
    const r = (rows as Record<string, unknown>[])[0];
    if (!r) return null;
    return toGpDriver({
      id: r.id as number,
      name: String(r.name || ""),
      email: (r.email as string) || null,
      phone: (r.phone as string) || null,
      driverType: (r.driverType as string) || null,
      status: (r.status as string) || null,
      hireDate: (r.hireDate as string) || null,
      birthDate: (r.birthDate as string) || null,
      dispatcher: (r.dispatcher as string) || null,
      cpm: r.cpm == null ? null : Number(r.cpm),
    });
  },

  async getSixWeekAverages(driverId: string): Promise<SixWeekAverages> {
    const pool = requireDb();
    const id = Number(driverId);
    if (!Number.isFinite(id)) {
      return {
        milesPerWeek: null,
        driverPayroll: null,
        grossMarginPct: null,
        cpm: null,
        weeksCounted: 0,
      };
    }

    // Last 6 weekly report rows for this driver (by year/week desc).
    const [rowsRaw] = await pool.query(
      `SELECT mileage, drivers_pay, gross_income, gross_profit, rate
         FROM gross_profit_reports
        WHERE driver_id = ?
        ORDER BY year DESC, week DESC
        LIMIT 6`,
      [id]
    );
    const rows = rowsRaw as Record<string, unknown>[];

    if (!rows.length) {
      return {
        milesPerWeek: null,
        driverPayroll: null,
        grossMarginPct: null,
        cpm: null,
        weeksCounted: 0,
      };
    }

    const n = rows.length;
    let miles = 0;
    let pay = 0;
    let income = 0;
    let gp = 0;
    let rateSum = 0;
    let rateN = 0;

    for (const r of rows) {
      miles += Number(r.mileage) || 0;
      pay += Number(r.drivers_pay) || 0;
      income += Number(r.gross_income) || 0;
      gp += Number(r.gross_profit) || 0;
      if (r.rate != null && !Number.isNaN(Number(r.rate))) {
        rateSum += Number(r.rate);
        rateN += 1;
      }
    }

    return {
      milesPerWeek: Math.round((miles / n) * 100) / 100,
      driverPayroll: Math.round((pay / n) * 100) / 100,
      grossMarginPct:
        income > 0 ? Math.round((gp / income) * 1000) / 10 : null,
      cpm: rateN ? Math.round((rateSum / rateN) * 10000) / 10000 : null,
      weeksCounted: n,
    };
  },
};
