/**
 * Merge detention rows that share the same load # and shipment #.
 * Keeps the oldest row (prefers one that already has a Gmail thread).
 *   pnpm detention:dedupe-same-load
 */
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
import mysql from "mysql2/promise";

const pool = mysql.createPool(process.env.DATABASE_URL);

const [groups] = await pool.query(`
  SELECT TRIM(load_number) AS load_number,
         TRIM(LEADING '0' FROM REPLACE(TRIM(shipment_number), ' ', '')) AS ship_key,
         COUNT(*) AS n
    FROM detentions
   WHERE load_number IS NOT NULL AND TRIM(load_number) <> ''
     AND shipment_number IS NOT NULL AND TRIM(shipment_number) <> ''
   GROUP BY TRIM(load_number),
            TRIM(LEADING '0' FROM REPLACE(TRIM(shipment_number), ' ', ''))
  HAVING COUNT(*) > 1
`);

console.log("Load+shipment groups with duplicates:", groups.length);
let merged = 0;
const conn = await pool.getConnection();
try {
  for (const g of groups) {
    const [rows] = await conn.query(
      `SELECT id, amount, email_date, created_at, thread_id, message_id, history_json, status
         FROM detentions
        WHERE TRIM(load_number) = ?
          AND TRIM(LEADING '0' FROM REPLACE(TRIM(shipment_number), ' ', '')) = ?
        ORDER BY
          CASE WHEN thread_id IS NOT NULL AND TRIM(thread_id) <> '' THEN 0 ELSE 1 END,
          created_at ASC`,
      [g.load_number, g.ship_key]
    );
    if (rows.length < 2) continue;
    const keep = rows[0];
    const drop = rows.slice(1);
    await conn.beginTransaction();
    try {
      let history = [];
      try {
        history =
          typeof keep.history_json === "string"
            ? JSON.parse(keep.history_json)
            : keep.history_json || [];
      } catch {
        history = [];
      }
      if (!Array.isArray(history)) history = [];
      for (const d of drop) {
        history.push({
          type: "dedupe_merge",
          timestamp: new Date().toISOString(),
          user: "detention-dedupe-same-load",
          text: `Merged duplicate ${d.id} (amount ${d.amount}, email ${d.email_date}) into ${keep.id} — same load ${g.load_number} / shipment`,
        });
        await conn.query(
          `UPDATE detentions SET message_id = NULL, thread_id = NULL WHERE id = ?`,
          [d.id]
        );
        await conn.query(
          `UPDATE detention_notes SET detention_id = ? WHERE detention_id = ?`,
          [keep.id, d.id]
        );
        await conn.query(`DELETE FROM detentions WHERE id = ?`, [d.id]);
        merged += 1;
      }
      await conn.query(
        `UPDATE detentions SET history_json = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
        [JSON.stringify(history), keep.id]
      );
      await conn.commit();
      console.log(
        `kept ${keep.id} load ${g.load_number} ship ${g.ship_key}; removed ${drop.map((d) => d.id).join(", ")}`
      );
    } catch (e) {
      await conn.rollback();
      console.error("fail", g.load_number, e.message);
    }
  }
} finally {
  conn.release();
}

console.log("Merged rows:", merged);
await pool.end();
