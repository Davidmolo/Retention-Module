import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { getPool } from '../db';

// Link fuel_transactions.driver_id so weekly PPG (SUM(amount)/SUM(gallons))
// works for both company and owner-operator drivers. Name match first (card
// names are often truncated ~12 chars), then truck unit + assignment window.

export interface FuelLinkResult {
  nameLinked: number;
  unitLinked: number;
}

const norm = (s: string | null | undefined): string =>
  (s || '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Best-effort link of unlinked fuel rows → drivers roster. Idempotent. */
export async function linkFuelDrivers(): Promise<FuelLinkResult> {
  const pool = getPool();

  const [drv] = await pool.query<RowDataPacket[]>(
    'SELECT id, first_name, middle_name, last_name FROM drivers'
  );
  const names = drv.map((d) => ({
    id: Number(d.id),
    full: norm(
      [d.first_name, d.middle_name, d.last_name].filter(Boolean).join(' ')
    ),
    fl: norm([d.first_name, d.last_name].filter(Boolean).join(' ')),
  }));
  const exact = new Map<string, number>();
  for (const n of names) {
    for (const k of [n.full, n.fl]) {
      if (k && !exact.has(k)) exact.set(k, n.id);
    }
  }

  const [fuel] = await pool.query<RowDataPacket[]>(
    `SELECT DISTINCT driver_name
       FROM fuel_transactions
      WHERE driver_id IS NULL
        AND driver_name IS NOT NULL
        AND TRIM(driver_name) <> ''`
  );

  let nameLinked = 0;
  for (const { driver_name } of fuel) {
    const key = norm(String(driver_name));
    let id = exact.get(key);
    if (!id) {
      const tokens = key.split(' ').filter(Boolean);
      // Single-token card names ("Eddy", "Chris") are too ambiguous —
      // "Eddy".startsWith would match Eddy Ilunga and steal another truck's fuel.
      if (tokens.length >= 2) {
        const matches = names.filter(
          (n) => n.full.startsWith(key) || n.fl.startsWith(key)
        );
        const uniq = [...new Set(matches.map((m) => m.id))];
        if (uniq.length === 1) id = uniq[0];
      }
    }
    // Card names often truncate: "Pedro Luis M" → Pedro Martinez
    // (first + optional middle + last initial).
    if (!id) {
      const parts = key.split(' ').filter(Boolean);
      if (parts.length >= 2) {
        const first = parts[0];
        const lastTok = parts[parts.length - 1];
        const initial =
          lastTok.length === 1
            ? lastTok
            : lastTok.length === 2 && lastTok.endsWith('.')
              ? lastTok[0]
              : null;
        if (initial) {
          const matches = names.filter((n) => {
            const np = n.fl.split(' ');
            return (
              np.length >= 2 &&
              np[0] === first &&
              np[np.length - 1].startsWith(initial)
            );
          });
          const uniq = [...new Set(matches.map((m) => m.id))];
          if (uniq.length === 1) id = uniq[0];
        }
      }
    }
    if (!id) continue;
    const [r] = await pool.query<ResultSetHeader>(
      `UPDATE fuel_transactions
          SET driver_id = ?
        WHERE driver_id IS NULL
          AND driver_name = ?`,
      [id, driver_name]
    );
    nameLinked += r.affectedRows;
  }

  // Unit fallback: real TMS unit on the card → truck → assignment that day.
  // Only when exactly one driver assignment covers that unit on that date.
  const [unitRes] = await pool.query<ResultSetHeader>(
    `UPDATE fuel_transactions ft
        JOIN (
          SELECT ft2.id AS fuel_id, MIN(a.driver_id) AS driver_id
            FROM fuel_transactions ft2
            JOIN trucks t
              ON TRIM(CAST(t.unit AS CHAR)) COLLATE utf8mb4_unicode_ci
               = TRIM(ft2.driver_unit_id) COLLATE utf8mb4_unicode_ci
            JOIN assignments a
              ON a.truck_id = t.id
             AND a.driver_id IS NOT NULL
             AND ft2.transaction_date IS NOT NULL
             AND DATE(a.start_date) <= ft2.transaction_date
             AND (a.end_date IS NULL OR DATE(a.end_date) >= ft2.transaction_date)
           WHERE ft2.driver_id IS NULL
             AND ft2.driver_unit_id IS NOT NULL
             AND TRIM(ft2.driver_unit_id) <> ''
             AND ft2.driver_unit_id REGEXP '^[0-9]{3,}$'
           GROUP BY ft2.id
          HAVING COUNT(DISTINCT a.driver_id) = 1
        ) m ON m.fuel_id = ft.id
         SET ft.driver_id = m.driver_id
       WHERE ft.driver_id IS NULL`
  );

  // Unlink name matches where the card unit belongs to a different driver that day.
  await pool.query(
    `UPDATE fuel_transactions ft
        JOIN trucks t
          ON TRIM(CAST(t.unit AS CHAR)) COLLATE utf8mb4_unicode_ci
           = TRIM(ft.driver_unit_id) COLLATE utf8mb4_unicode_ci
        JOIN assignments a
          ON a.truck_id = t.id
         AND a.driver_id IS NOT NULL
         AND a.driver_id <> ft.driver_id
         AND ft.transaction_date IS NOT NULL
         AND DATE(a.start_date) <= ft.transaction_date
         AND (a.end_date IS NULL OR DATE(a.end_date) >= ft.transaction_date)
         SET ft.driver_id = NULL
       WHERE ft.driver_id IS NOT NULL
         AND ft.driver_unit_id IS NOT NULL
         AND TRIM(ft.driver_unit_id) <> ''
         AND ft.driver_unit_id REGEXP '^[0-9]+$'
         AND NOT EXISTS (
           SELECT 1
             FROM assignments a2
             JOIN trucks t2 ON t2.id = a2.truck_id
            WHERE a2.driver_id = ft.driver_id
              AND TRIM(CAST(t2.unit AS CHAR)) COLLATE utf8mb4_unicode_ci
                = TRIM(ft.driver_unit_id) COLLATE utf8mb4_unicode_ci
              AND DATE(a2.start_date) <= ft.transaction_date
              AND (a2.end_date IS NULL OR DATE(a2.end_date) >= ft.transaction_date)
         )`
  );

  return { nameLinked, unitLinked: unitRes.affectedRows };
}
