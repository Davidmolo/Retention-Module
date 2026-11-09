// OpenRoad /fuel_card_transactions → per-driver diesel week totals for Net P/G.
// Company PPG = SUM(diesel_amount − discount) / SUM(diesel_gallons).

import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { getPool } from '../db';
import { weekRange } from '../week';
import { fetchOpenRoadJson } from './client';

const FUEL_CARDS_URL =
  process.env.OPENROAD_FUEL_CARD_TRANSACTIONS_URL ||
  'https://app.openroadtms.com/api/ext/v1/fuel_card_transactions';

export interface OpenRoadFuelCardTxn {
  id?: number;
  driver_id?: number | null;
  unit?: string | null;
  card?: string | null;
  diesel_gallons?: string | number | null;
  diesel_amount?: string | number | null;
  discount?: string | number | null;
  net_pg?: string | number | null;
  date?: string | null;
  [key: string]: unknown;
}

export interface OpenRoadFuelSyncResult {
  year: number;
  week: number;
  start: string;
  end: string;
  fetched: number;
  matched: number;
  unmatched: number;
  drivers: number;
  pages: number;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function fetchFuelCardsForRange(
  start: string,
  end: string
): Promise<{ items: OpenRoadFuelCardTxn[]; pages: number }> {
  const perPage = Math.max(1, Number(process.env.OPENROAD_PER_PAGE || 100));
  const base = FUEL_CARDS_URL.replace(/\/$/, '');
  const items: OpenRoadFuelCardTxn[] = [];
  let page = 1;
  let pages = 0;
  const MAX_PAGES = 500;

  while (page <= MAX_PAGES) {
    const url = new URL(base);
    url.searchParams.set('page', String(page));
    url.searchParams.set('per_page', String(perPage));
    url.searchParams.set('date[gte]', start);
    url.searchParams.set('date[lte]', end);
    const json = (await fetchOpenRoadJson(url.toString())) as {
      data?: OpenRoadFuelCardTxn[];
      meta?: { last_page?: number };
    };
    pages += 1;
    const batch = Array.isArray(json?.data) ? json.data : [];
    if (!batch.length) break;
    items.push(...batch);
    const last = json?.meta?.last_page;
    if (last != null && page >= last) break;
    if (batch.length < perPage) break;
    page += 1;
  }

  return { items, pages };
}

interface Agg {
  dieselGallons: number;
  dieselAmount: number;
  discount: number;
  dieselNet: number;
  txnCount: number;
}

/** Pull OpenRoad fuel cards for a Tue→Mon week and upsert per-driver diesel totals. */
export async function syncOpenRoadFuelForWeek(
  year: number,
  week: number
): Promise<OpenRoadFuelSyncResult> {
  const { start, end } = weekRange(year, week);
  const { items, pages } = await fetchFuelCardsForRange(start, end);

  const pool = getPool();
  const [drvRows] = await pool.query<RowDataPacket[]>(`SELECT id FROM drivers`);
  const driverIds = new Set(drvRows.map((r) => Number(r.id)));

  // Mantas: trust OR driver_id only (settlement Fuel tab). No unit/card fallback.
  const resolveDriver = (t: OpenRoadFuelCardTxn): number | null => {
    const rawId = t.driver_id == null ? null : Number(t.driver_id);
    if (rawId != null && Number.isFinite(rawId) && driverIds.has(rawId)) {
      return rawId;
    }
    return null;
  };

  const byDriver = new Map<number, Agg>();
  let matched = 0;
  let unmatched = 0;
  for (const t of items) {
    const gal = num(t.diesel_gallons);
    if (gal <= 0) continue;
    const dieselAmount = num(t.diesel_amount);
    const discount = num(t.discount);
    const dieselNet = Math.max(0, dieselAmount - discount);
    const driverId = resolveDriver(t);
    if (!driverId) {
      unmatched += 1;
      continue;
    }
    matched += 1;
    const cur = byDriver.get(driverId) ?? {
      dieselGallons: 0,
      dieselAmount: 0,
      discount: 0,
      dieselNet: 0,
      txnCount: 0,
    };
    cur.dieselGallons += gal;
    cur.dieselAmount += dieselAmount;
    cur.discount += discount;
    cur.dieselNet += dieselNet;
    cur.txnCount += 1;
    byDriver.set(driverId, cur);
  }

  await pool.query(
    `DELETE FROM openroad_fuel_week_totals WHERE year = ? AND week = ?`,
    [year, week]
  );

  const rows = [...byDriver.entries()].map(([driverId, t]) => [
    driverId,
    year,
    week,
    Math.round(t.dieselGallons * 1000) / 1000,
    Math.round(t.dieselAmount * 100) / 100,
    Math.round(t.discount * 100) / 100,
    Math.round(t.dieselNet * 100) / 100,
    t.txnCount,
  ]);

  if (rows.length) {
    await pool.query<ResultSetHeader>(
      `INSERT INTO openroad_fuel_week_totals
         (driver_id, year, week, diesel_gallons, diesel_amount, discount,
          diesel_net, txn_count)
       VALUES ?`,
      [rows]
    );
  }

  return {
    year,
    week,
    start,
    end,
    fetched: items.length,
    matched,
    unmatched,
    drivers: rows.length,
    pages,
  };
}
