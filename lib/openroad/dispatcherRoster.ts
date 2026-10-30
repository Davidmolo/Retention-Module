import type { ResultSetHeader } from "mysql2";
import { getPool } from "@/lib/db";

/** OpenRoad still lists Tom Simkus (suspended) as manager. He has no drivers. */
const TOM_SIMKUS_USER_ID = 5909;
/** Team driver with Ronnie Sieg — same truck, same dispatcher. */
const LINDSAY_NORRIS_DRIVER_ID = 22675;
const RONNIE_SIEG_DRIVER_ID = 18746;

/**
 * OpenRoad sync copies manager_id back onto the roster.
 * Re-apply these two rules after every driver sync.
 */
export async function applyDispatcherRosterRules(): Promise<{
  tomCleared: number;
  lindsayUpdated: number;
}> {
  const pool = getPool();
  const [tomRes] = await pool.query<ResultSetHeader>(
    `UPDATE drivers SET manager_id = NULL WHERE manager_id = ?`,
    [TOM_SIMKUS_USER_ID]
  );
  const [lindsayRes] = await pool.query<ResultSetHeader>(
    `UPDATE drivers lindsay
       JOIN drivers ronnie
         ON ronnie.id = ?
        AND LOWER(TRIM(ronnie.first_name)) = 'ronnie'
        AND LOWER(TRIM(ronnie.last_name)) = 'sieg'
        SET lindsay.manager_id = ronnie.manager_id
      WHERE lindsay.id = ?
        AND LOWER(TRIM(lindsay.first_name)) = 'lindsay'
        AND LOWER(TRIM(lindsay.last_name)) = 'norris'
        AND ronnie.manager_id IS NOT NULL
        AND (lindsay.manager_id IS NULL OR lindsay.manager_id <> ronnie.manager_id)`,
    [RONNIE_SIEG_DRIVER_ID, LINDSAY_NORRIS_DRIVER_ID]
  );
  return {
    tomCleared: tomRes.affectedRows,
    lindsayUpdated: lindsayRes.affectedRows,
  };
}
