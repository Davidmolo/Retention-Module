import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
import mysql from "mysql2/promise";

const pool = mysql.createPool(process.env.DATABASE_URL);
const COMP_RANK = { ok: 3, pending: 2, no_follow_up: 2, missed: 1, "n/a": 0 };

const [pairs] = await pool.query(`
  SELECT
    a.id AS sheet_id, b.id AS gmail_id, a.load_number,
    a.dispatcher_compliance AS sheet_comp,
    b.dispatcher_compliance AS gmail_comp,
    a.dispatcher_replied_at AS sheet_replied,
    b.dispatcher_replied_at AS gmail_replied,
    b.message_id AS gmail_message_id,
    b.thread_id AS gmail_thread_id,
    b.thread_url AS gmail_thread_url,
    a.history_json AS sheet_history
  FROM detentions a
  JOIN detentions b
    ON a.load_number = b.load_number AND a.id <> b.id
   AND a.source = 'sheet_import'
   AND b.source = 'gmail_intake'
   AND ABS(TIMESTAMPDIFF(HOUR, a.email_date, b.email_date)) BETWEEN 4 AND 8
`);

console.log("Pairs to merge:", pairs.length);
let merged = 0;
const conn = await pool.getConnection();
try {
  for (const p of pairs) {
    await conn.beginTransaction();
    try {
      const sheetRank = COMP_RANK[p.sheet_comp] ?? -1;
      const gmailRank = COMP_RANK[p.gmail_comp] ?? -1;
      const useGmailComp = gmailRank > sheetRank;
      let history = [];
      try {
        history = typeof p.sheet_history === "string" ? JSON.parse(p.sheet_history) : (p.sheet_history || []);
      } catch { history = []; }
      if (!Array.isArray(history)) history = [];
      history.push({
        type: "dedupe_merge",
        timestamp: new Date().toISOString(),
        user: "detention-dedupe",
        text: `Merged duplicate Gmail twin ${p.gmail_id} into sheet row (load ${p.load_number})`,
      });

      // Free unique message_id on the twin before assigning it to the sheet row
      await conn.query(
        `UPDATE detentions SET message_id = NULL, thread_id = NULL WHERE id = ?`,
        [p.gmail_id]
      );

      await conn.query(
        `UPDATE detentions SET
           message_id = ?,
           thread_id = ?,
           thread_url = COALESCE(?, thread_url),
           dispatcher_compliance = CASE WHEN ? = 1 THEN ? ELSE dispatcher_compliance END,
           dispatcher_replied_at = CASE WHEN ? = 1 THEN COALESCE(?, dispatcher_replied_at) ELSE dispatcher_replied_at END,
           source = 'sheet_import+gmail',
           history_json = ?,
           updated_at = CURRENT_TIMESTAMP(3)
         WHERE id = ?`,
        [
          p.gmail_message_id,
          p.gmail_thread_id,
          p.gmail_thread_url,
          useGmailComp ? 1 : 0,
          p.gmail_comp,
          useGmailComp ? 1 : 0,
          p.gmail_replied,
          JSON.stringify(history),
          p.sheet_id,
        ]
      );

      await conn.query(
        `UPDATE detention_notes SET detention_id = ? WHERE detention_id = ?`,
        [p.sheet_id, p.gmail_id]
      );
      await conn.query(`DELETE FROM detentions WHERE id = ?`, [p.gmail_id]);
      await conn.commit();
      merged += 1;
    } catch (e) {
      await conn.rollback();
      console.error("fail", p.load_number, e.message);
    }
  }
} finally {
  conn.release();
}

console.log("Merged:", merged);
const [left] = await pool.query(`
  SELECT COUNT(*) AS loads_with_dupes FROM (
    SELECT load_number FROM detentions
    WHERE load_number IS NOT NULL AND TRIM(load_number)<>''
    GROUP BY load_number HAVING COUNT(*)>1
  ) t
`);
console.table(left);
const [total] = await pool.query(`SELECT COUNT(*) AS total FROM detentions`);
console.table(total);
await pool.end();
