import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { getPool } from '../db';
import { fetchPage } from './client';
import { toSqlDateTimeUtc } from '../dates';
import { weekOf, weekRange } from '../week';

// OpenRoad TMS driver_routes sync → `driver_routes` table.
// Paginate + upsert by id. Optional year/week args limit to routes whose
// source_updated_at falls in that Tuesday→Monday week (like samsara mpg).

const DRIVER_ROUTES_URL = process.env.OPENROAD_DRIVER_ROUTES_URL;

interface DriverRouteRecord {
  id?: number;
  load_id?: number | null;
  driver_id?: number | null;
  destination_from_id?: number | null;
  destination_to_id?: number | null;
  position_from?: number | null;
  position_to?: number | null;
  route_type?: string | null;
  toll_discouraged?: boolean | null;
  loaded_miles?: unknown;
  empty_miles?: unknown;
  duration_loaded?: unknown;
  duration_empty?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  [key: string]: unknown;
}

const COLS = [
  'id',
  'load_id',
  'driver_id',
  'destination_from_id',
  'destination_to_id',
  'position_from',
  'position_to',
  'route_type',
  'toll_discouraged',
  'loaded_miles',
  'empty_miles',
  'duration_loaded',
  'duration_empty',
  'revenue',
  'source_created_at',
  'source_updated_at',
];

const UPSERT_SQL =
  `INSERT INTO driver_routes (${COLS.join(', ')}) VALUES ? ` +
  `ON DUPLICATE KEY UPDATE ` +
  COLS.filter((c) => c !== 'id').map((c) => `${c}=VALUES(${c})`).join(', ');

function rowOf(
  r: DriverRouteRecord,
  revenue: number | null
): unknown[] {
  return [
    r.id,
    r.load_id ?? null,
    r.driver_id ?? null,
    r.destination_from_id ?? null,
    r.destination_to_id ?? null,
    r.position_from ?? null,
    r.position_to ?? null,
    r.route_type ?? null,
    r.toll_discouraged == null ? null : r.toll_discouraged ? 1 : 0,
    r.loaded_miles ?? null,
    r.empty_miles ?? null,
    r.duration_loaded ?? null,
    r.duration_empty ?? null,
    revenue,
    toSqlDateTimeUtc(r.created_at),
    toSqlDateTimeUtc(r.updated_at),
  ];
}

function inWeek(r: DriverRouteRecord, startMs: number, endMs: number): boolean {
  const raw = r.updated_at ?? r.created_at;
  if (raw == null) return false;
  const s = String(raw).trim();
  const hasTz = /Z$/i.test(s) || /[+-]\d{2}:?\d{2}$/.test(s);
  const t = new Date(hasTz ? s : s.includes('T') ? `${s}Z` : s.replace(' ', 'T') + 'Z').getTime();
  if (Number.isNaN(t)) return false;
  return t >= startMs && t <= endMs;
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Share of load linehaul by this route's loaded_miles / load.miles. */
async function revenueByLoadId(
  routes: DriverRouteRecord[]
): Promise<Map<number, { miles: number; revenue: number }>> {
  const loadIds = [
    ...new Set(
      routes
        .map((r) => r.load_id)
        .filter((id): id is number => id != null && Number.isFinite(id))
    ),
  ];
  const map = new Map<number, { miles: number; revenue: number }>();
  if (!loadIds.length) return map;
  const pool = getPool();
  const [rows] = await pool.query<(RowDataPacket & {
    id: number;
    miles: unknown;
    revenue: unknown;
  })[]>(
    `SELECT id, miles,
            COALESCE(linehaul_rate, revenue, 0) AS revenue
       FROM loads WHERE id IN (?)`,
    [loadIds]
  );
  for (const row of rows) {
    map.set(Number(row.id), {
      miles: Number(row.miles) || 0,
      revenue: Number(row.revenue) || 0,
    });
  }
  return map;
}

function proportionalRevenue(
  loadedMiles: number,
  loadMiles: number,
  loadRevenue: number
): number {
  if (loadMiles <= 0) return 0;
  return Math.round(((loadRevenue * loadedMiles) / loadMiles) * 100) / 100;
}

/**
 * Split load linehaul across routes on that load (linehaul_rate, else total).
 * When all loaded segments are present (sum ≈ load.miles), floor later
 * drivers to $100 and give the first (by position) the remainder — matches
 * TMS payroll round amounts (e.g. Daud $1000 vs proportional $921).
 * Otherwise each route keeps a plain mile share.
 */
export async function allocateRouteRevenueForLoads(
  loadIds: number[]
): Promise<number> {
  const ids = [...new Set(loadIds.filter((id) => Number.isFinite(id)))];
  if (!ids.length) return 0;
  const pool = getPool();
  const [loadRows] = await pool.query<(RowDataPacket & {
    id: number;
    miles: unknown;
    revenue: unknown;
  })[]>(
    `SELECT id, miles,
            COALESCE(linehaul_rate, revenue, 0) AS revenue
       FROM loads WHERE id IN (?)`,
    [ids]
  );
  const loadMap = new Map(
    loadRows.map((r) => [
      Number(r.id),
      { miles: Number(r.miles) || 0, revenue: Number(r.revenue) || 0 },
    ])
  );
  const [routeRows] = await pool.query<(RowDataPacket & {
    id: number;
    load_id: number;
    loaded_miles: unknown;
    position_from: number | null;
  })[]>(
    `SELECT id, load_id, loaded_miles, position_from
       FROM driver_routes
      WHERE load_id IN (?)
      ORDER BY load_id, position_from IS NULL, position_from, id`,
    [ids]
  );

  const byLoad = new Map<number, typeof routeRows>();
  for (const r of routeRows) {
    const lid = Number(r.load_id);
    const list = byLoad.get(lid) ?? [];
    list.push(r);
    byLoad.set(lid, list);
  }

  let updated = 0;
  for (const [loadId, routes] of byLoad) {
    const load = loadMap.get(loadId);
    if (!load || load.miles <= 0 || load.revenue <= 0) {
      for (const r of routes) {
        await pool.query(`UPDATE driver_routes SET revenue = NULL WHERE id = ?`, [
          r.id,
        ]);
        updated += 1;
      }
      continue;
    }

    const props = routes.map((r) => ({
      id: Number(r.id),
      loaded: num(r.loaded_miles) ?? 0,
      prop: proportionalRevenue(
        num(r.loaded_miles) ?? 0,
        load.miles,
        load.revenue
      ),
    }));
    const loadedSum = props.reduce((s, p) => s + p.loaded, 0);
    const complete =
      routes.length >= 2 && Math.abs(loadedSum - load.miles) < 0.5;

    const revenues = new Map<number, number>();
    if (complete) {
      // First by position keeps remainder; others floor to $100 (TMS round pay).
      let assigned = 0;
      for (let i = 1; i < props.length; i++) {
        const floored = Math.floor(props[i].prop / 100) * 100;
        revenues.set(props[i].id, floored);
        assigned += floored;
      }
      revenues.set(
        props[0].id,
        Math.round((load.revenue - assigned) * 100) / 100
      );
    } else {
      for (const p of props) revenues.set(p.id, p.prop);
    }

    for (const [id, revenue] of revenues) {
      await pool.query(`UPDATE driver_routes SET revenue = ? WHERE id = ?`, [
        revenue,
        id,
      ]);
      updated += 1;
    }
  }
  return updated;
}

export async function upsertDriverRoutes(
  routes: DriverRouteRecord[]
): Promise<{ stored: number; skipped: number }> {
  // Require load_id for FK mapping; skip orphan API rows.
  const withLoad = routes.filter((r) => r.id != null && r.load_id != null);
  if (!withLoad.length) return { stored: 0, skipped: routes.length };
  const loads = await revenueByLoadId(withLoad);
  // Provisional proportional; batch-end reallocates complete multi-driver loads.
  const rows = withLoad.map((r) => {
    const load = r.load_id != null ? loads.get(Number(r.load_id)) : null;
    const rev =
      load && load.miles > 0
        ? proportionalRevenue(num(r.loaded_miles) ?? 0, load.miles, load.revenue)
        : null;
    return rowOf(r, rev);
  });
  const skippedMissing = routes.length - withLoad.length;
  const pool = getPool();
  try {
    const [res] = await pool.query<ResultSetHeader>(UPSERT_SQL, [rows]);
    await allocateRouteRevenueForLoads(
      withLoad.map((r) => Number(r.load_id))
    );
    return { stored: res.affectedRows, skipped: skippedMissing };
  } catch {
    let stored = 0;
    let skipped = skippedMissing;
    for (const row of rows) {
      try {
        const [res] = await pool.query<ResultSetHeader>(UPSERT_SQL, [[row]]);
        stored += res.affectedRows;
      } catch (e) {
        skipped += 1;
        console.warn(`  skip driver_route id=${row[0]}: ${(e as Error).message}`);
      }
    }
    await allocateRouteRevenueForLoads(
      withLoad.map((r) => Number(r.load_id))
    );
    return { stored, skipped };
  }
}

export interface DriverRouteSyncResult {
  fetched: number;
  stored: number;
  skipped: number;
  pages: number;
  year?: number;
  week?: number;
}

export async function syncTmsDriverRoutes(
  year?: number,
  week?: number
): Promise<DriverRouteSyncResult> {
  const perPage = Math.max(1, Number(process.env.OPENROAD_PER_PAGE || 100));
  const MAX_PAGES = 100_000;
  let page = 1;
  const result: DriverRouteSyncResult = {
    fetched: 0,
    stored: 0,
    skipped: 0,
    pages: 0,
  };

  let startMs: number | null = null;
  let endMs: number | null = null;
  if (year != null && week != null) {
    const { start, end } = weekRange(year, week);
    startMs = Date.parse(`${start}T00:00:00.000Z`);
    endMs = Date.parse(`${end}T23:59:59.999Z`);
    result.year = year;
    result.week = week;
  }

  while (page <= MAX_PAGES) {
    const { items, lastPage } = await fetchPage(
      DRIVER_ROUTES_URL,
      page,
      perPage,
      '-updated_at'
    );
    result.pages += 1;
    if (!items.length) break;

    let batch = items as DriverRouteRecord[];
    if (startMs != null && endMs != null) {
      batch = batch.filter((r) => inWeek(r, startMs!, endMs!));
      // API sorted by -updated_at: once a full page is older than week start, stop.
      const oldest = items[items.length - 1] as DriverRouteRecord;
      const oldestAt = new Date(
        String(oldest.updated_at ?? oldest.created_at)
      ).getTime();
      if (!Number.isNaN(oldestAt) && oldestAt < startMs && batch.length === 0) {
        break;
      }
    }

    result.fetched += batch.length;
    if (batch.length) {
      const { stored, skipped } = await upsertDriverRoutes(batch);
      result.stored += stored;
      result.skipped += skipped;
    }

    if (lastPage != null) {
      if (page >= lastPage) break;
    } else if (items.length < perPage) {
      break;
    }
    page += 1;
  }
  return result;
}

/** Default week = previous completed Tuesday→Monday week (same as samsara mpg). */
export function previousWeek(): { year: number; week: number } {
  const prev = new Date();
  prev.setUTCDate(prev.getUTCDate() - 7);
  return weekOf(prev);
}
