/**
 * Scan Gmail threads for dispatcher replies within 48 hours of detention email.
 */
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import { getValidGmailAccessToken } from "@/lib/detention/gmailOAuth";

const COMPLIANCE_WINDOW_MS = 48 * 60 * 60 * 1000;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function extractEmail(fromHeader: string): string | null {
  const m = String(fromHeader || "").match(
    /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/
  );
  return m ? m[0].toLowerCase() : null;
}

async function lookupDispatcherEmail(
  dispatcherName: string | null
): Promise<string | null> {
  if (!dispatcherName?.trim()) return null;
  const pool = getPool();
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT email
         FROM tms_users
        WHERE email IS NOT NULL AND TRIM(email) <> ''
          AND LOWER(TRIM(CONCAT(COALESCE(first_name,''), ' ', COALESCE(last_name,'')))) = LOWER(?)
        LIMIT 1`,
      [dispatcherName.trim()]
    );
    const email = String(rows[0]?.email || "")
      .trim()
      .toLowerCase();
    return email.includes("@") ? email : null;
  } catch {
    return null;
  }
}

type ThreadMsg = {
  id: string;
  internalDate?: string;
  payload?: { headers?: { name: string; value: string }[] };
};

async function fetchThreadMessages(threadId: string): Promise<ThreadMsg[]> {
  const { accessToken } = await getValidGmailAccessToken();
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(
      threadId
    )}?format=metadata&metadataHeaders=From&metadataHeaders=Date`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const json = (await res.json()) as {
    messages?: ThreadMsg[];
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(json.error?.message || `Gmail thread get failed (${res.status})`);
  }
  return json.messages || [];
}

function findDispatcherReply(opts: {
  messages: ThreadMsg[];
  emailStartMs: number;
  dispatcherEmail: string;
  originalMessageId?: string | null;
}): { repliedAt: Date | null; within48h: boolean } {
  const deadline = opts.emailStartMs + COMPLIANCE_WINDOW_MS;
  let repliedAt: Date | null = null;

  for (const msg of opts.messages) {
    if (opts.originalMessageId && msg.id === opts.originalMessageId) continue;
    const ms = msg.internalDate ? Number(msg.internalDate) : NaN;
    if (!Number.isFinite(ms) || ms <= opts.emailStartMs) continue;

    const from =
      (msg.payload?.headers || []).find(
        (h) => h.name.toLowerCase() === "from"
      )?.value || "";
    const email = extractEmail(from);
    if (!email || email !== opts.dispatcherEmail) continue;

    const at = new Date(ms);
    if (!repliedAt || at < repliedAt) repliedAt = at;
  }

  if (!repliedAt) return { repliedAt: null, within48h: false };
  return {
    repliedAt,
    within48h: repliedAt.getTime() <= deadline,
  };
}

export type ComplianceScanResult = {
  checked: number;
  ok: number;
  missed: number;
  pending: number;
  na: number;
  errors: number;
};

export async function runDetentionComplianceScan(opts?: {
  maxPerRun?: number;
}): Promise<ComplianceScanResult> {
  const pool = getPool();
  const maxPerRun = opts?.maxPerRun ?? 80;
  const result: ComplianceScanResult = {
    checked: 0,
    ok: 0,
    missed: 0,
    pending: 0,
    na: 0,
    errors: 0,
  };

  // Prefer rows needing a check: never checked, still pending, or missing email.
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, dispatcher, dispatcher_email, thread_id, message_id, email_date, created_at,
            dispatcher_compliance
       FROM detentions
      WHERE thread_id IS NOT NULL AND TRIM(thread_id) <> ''
        AND (
          dispatcher_compliance IS NULL
          OR dispatcher_compliance = 'pending'
          OR dispatcher_compliance_checked_at IS NULL
          OR (dispatcher_compliance = 'n/a' AND dispatcher_email IS NULL)
        )
      ORDER BY COALESCE(email_date, created_at) DESC
      LIMIT ?`,
    [maxPerRun]
  );

  for (const row of rows) {
    result.checked += 1;
    try {
      const emailStart = new Date(row.email_date || row.created_at);
      const emailStartMs = emailStart.getTime();
      if (!Number.isFinite(emailStartMs)) {
        result.na += 1;
        continue;
      }

      let dispatcherEmail = row.dispatcher_email
        ? String(row.dispatcher_email).toLowerCase()
        : null;
      if (!dispatcherEmail) {
        dispatcherEmail = await lookupDispatcherEmail(
          row.dispatcher ? String(row.dispatcher) : null
        );
      }

      if (!dispatcherEmail) {
        await pool.query<ResultSetHeader>(
          `UPDATE detentions
              SET dispatcher_compliance = 'n/a',
                  dispatcher_compliance_checked_at = CURRENT_TIMESTAMP(3)
            WHERE id = ?`,
          [row.id]
        );
        result.na += 1;
        await sleep(200);
        continue;
      }

      await sleep(450);
      const messages = await fetchThreadMessages(String(row.thread_id));
      const reply = findDispatcherReply({
        messages,
        emailStartMs,
        dispatcherEmail,
        originalMessageId: row.message_id ? String(row.message_id) : null,
      });

      const now = Date.now();
      let compliance: "ok" | "missed" | "pending";
      if (reply.repliedAt && reply.within48h) compliance = "ok";
      else if (reply.repliedAt && !reply.within48h) compliance = "missed";
      else if (now <= emailStartMs + COMPLIANCE_WINDOW_MS) compliance = "pending";
      else compliance = "missed";

      await pool.query<ResultSetHeader>(
        `UPDATE detentions
            SET dispatcher_email = ?,
                dispatcher_replied_at = ?,
                last_reply_from = COALESCE(?, last_reply_from),
                last_reply_at = COALESCE(?, last_reply_at),
                dispatcher_compliance = ?,
                dispatcher_compliance_checked_at = CURRENT_TIMESTAMP(3)
          WHERE id = ?`,
        [
          dispatcherEmail,
          reply.repliedAt,
          reply.repliedAt ? dispatcherEmail : null,
          reply.repliedAt,
          compliance,
          row.id,
        ]
      );

      if (compliance === "ok") result.ok += 1;
      else if (compliance === "missed") result.missed += 1;
      else result.pending += 1;
    } catch (e) {
      result.errors += 1;
      console.error("[detention-compliance]", row.id, (e as Error).message);
      await sleep(5_000);
    }
  }

  return result;
}
