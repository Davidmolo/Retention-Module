import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { toAppCalendarDate } from '../dates';
import { getPool } from '../db';
import { weekRange } from '../week';
import {
  fetchFuelTransactions,
  type RelayFuelTransaction,
  type RelayFuelItem,
} from './client';

export interface RelayFuelSyncResult {
  year: number;
  week: number;
  start: string;
  end: string;
  fetched: number;
  matched: number;
  unmatched: number;
  drivers: number;
}

const norm = (s: string | null | undefined): string =>
  (s || '').trim().toLowerCase().replace(/\s+/g, ' ');

function dayAfter(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function dayBefore(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function money(s: string | null | undefined): number {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** Diesel (and diesel blends) — excludes DEF / reefer / gas. */
function isDieselItem(item: RelayFuelItem): boolean {
  const t = String(item.fuel_type ?? '').toLowerCase();
  return t === 'diesel' || t.startsWith('diesel_') || t === 'biodiesel';
}

/**
 * Day/Smith/Wagner: retail & paid = full txn totals (without / with driver
 * discount), including DEF etc. Gallons stay diesel-only for OO $0.12/gal.
 */
function amountsFromTxn(t: RelayFuelTransaction): {
  retail: number;
  paid: number;
  saved: number;
  gallons: number;
} {
  let gallons = 0;
  for (const item of t.fuel_items ?? []) {
    if (!isDieselItem(item)) continue;
    const v = Number(item.volume);
    if (Number.isFinite(v)) gallons += v;
  }
  const retail = money(t.total_retail_price);
  const paid = money(t.total_amount_paid);
  return {
    retail,
    paid,
    saved: money(t.total_amount_saved) || Math.max(0, retail - paid),
    gallons,
  };
}

interface Agg {
  retail: number;
  paid: number;
  saved: number;
  gallons: number;
  txnCount: number;
  firstName: string;
  lastName: string;
  integrationId: string;
}

/** Pull Relay fuel for a Tue→Mon week and upsert per-driver OO totals. */
export async function syncRelayFuelForWeek(
  year: number,
  week: number
): Promise<RelayFuelSyncResult> {
  const { start, end } = weekRange(year, week);
  // Fetch ±1 calendar day in UTC so Chicago-local edge txns are included,
  // then keep only those whose America/Chicago date falls in [start, end].
  const txns = await fetchFuelTransactions({
    dtstart: `${dayBefore(start)}T00:00:00Z`,
    dtend: `${dayAfter(end)}T00:00:00Z`,
  });

  const byKey = new Map<string, Agg>();
  for (const t of txns) {
    const localDate = toAppCalendarDate(t.created_at);
    if (!localDate || localDate < start || localDate > end) continue;

    const d = t.driver ?? ({} as RelayFuelTransaction['driver']);
    const integrationId = String(d.integration_id ?? '').trim();
    const firstName = String(d.first_name ?? '').trim();
    const lastName = String(d.last_name ?? '').trim();
    const key =
      integrationId ||
      (firstName || lastName
        ? `name:${norm(`${firstName} ${lastName}`)}`
        : `txn:${t.transaction_id}`);
    const cur = byKey.get(key) ?? {
      retail: 0,
      paid: 0,
      saved: 0,
      gallons: 0,
      txnCount: 0,
      firstName,
      lastName,
      integrationId,
    };
    const a = amountsFromTxn(t);
    cur.retail += a.retail;
    cur.paid += a.paid;
    cur.saved += a.saved;
    cur.gallons += a.gallons;
    cur.txnCount += 1;
    if (!cur.firstName && firstName) cur.firstName = firstName;
    if (!cur.lastName && lastName) cur.lastName = lastName;
    if (!cur.integrationId && integrationId) cur.integrationId = integrationId;
    byKey.set(key, cur);
  }

  const pool = getPool();
  const [drvRows] = await pool.query<RowDataPacket[]>(
    `SELECT id, first_name, middle_name, last_name FROM drivers`
  );
  const byFull = new Map<string, number>();
  const byFl = new Map<string, number>();
  for (const d of drvRows) {
    const id = Number(d.id);
    const full = norm(
      [d.first_name, d.middle_name, d.last_name].filter(Boolean).join(' ')
    );
    const fl = norm([d.first_name, d.last_name].filter(Boolean).join(' '));
    if (full && !byFull.has(full)) byFull.set(full, id);
    if (fl && !byFl.has(fl)) byFl.set(fl, id);
  }

  // card / integration_id → driver via already-linked .dat rows
  const [cardRows] = await pool.query<RowDataPacket[]>(
    `SELECT driver_id,
            TRIM(LEADING 'U' FROM TRIM(card_number)) AS card
       FROM fuel_transactions
      WHERE driver_id IS NOT NULL
        AND card_number IS NOT NULL
        AND TRIM(card_number) <> ''`
  );
  const byCard = new Map<string, number>();
  for (const r of cardRows) {
    const card = String(r.card ?? '').replace(/\D/g, '');
    const id = Number(r.driver_id);
    if (card && id && !byCard.has(card)) byCard.set(card, id);
  }

  const resolveDriver = (a: Agg): number | null => {
    const card = a.integrationId.replace(/\D/g, '');
    if (card && byCard.has(card)) return byCard.get(card)!;
    const fl = norm(`${a.firstName} ${a.lastName}`);
    if (fl && byFl.has(fl)) return byFl.get(fl)!;
    if (fl && byFull.has(fl)) return byFull.get(fl)!;
    // optional middle-name: try first+last against full keys that start/end match
    if (a.firstName && a.lastName) {
      const first = norm(a.firstName);
      const last = norm(a.lastName);
      const hits = [...byFull.entries()].filter(([k]) => {
        const parts = k.split(' ');
        return parts[0] === first && parts[parts.length - 1] === last;
      });
      const uniq = [...new Set(hits.map(([, id]) => id))];
      if (uniq.length === 1) return uniq[0];
    }
    return null;
  };

  // One row per driver (merge if multiple Relay keys map to same roster id)
  const byDriver = new Map<
    number,
    { retail: number; paid: number; saved: number; gallons: number; txnCount: number }
  >();
  let matched = 0;
  let unmatched = 0;
  for (const a of byKey.values()) {
    const driverId = resolveDriver(a);
    if (!driverId) {
      unmatched += 1;
      continue;
    }
    matched += 1;
    const cur = byDriver.get(driverId) ?? {
      retail: 0,
      paid: 0,
      saved: 0,
      gallons: 0,
      txnCount: 0,
    };
    cur.retail += a.retail;
    cur.paid += a.paid;
    cur.saved += a.saved;
    cur.gallons += a.gallons;
    cur.txnCount += a.txnCount;
    byDriver.set(driverId, cur);
  }

  // Replace this week's rows so regenerating is idempotent.
  await pool.query(
    `DELETE FROM relay_fuel_week_totals WHERE year = ? AND week = ?`,
    [year, week]
  );

  const rows = [...byDriver.entries()].map(([driverId, t]) => [
    driverId,
    year,
    week,
    Math.round(t.retail * 100) / 100,
    Math.round(t.paid * 100) / 100,
    Math.round(t.saved * 100) / 100,
    t.gallons > 0 ? Math.round(t.gallons * 1000) / 1000 : null,
    t.txnCount,
  ]);

  if (rows.length) {
    await pool.query<ResultSetHeader>(
      `INSERT INTO relay_fuel_week_totals
         (driver_id, year, week, amount_retail, amount_paid, amount_saved,
          gallons, txn_count)
       VALUES ?`,
      [rows]
    );
  }

  return {
    year,
    week,
    start,
    end,
    fetched: txns.length,
    matched,
    unmatched,
    drivers: rows.length,
  };
}
