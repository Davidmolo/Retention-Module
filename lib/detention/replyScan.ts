/**
 * Scan Gmail threads for dispatcher replies within 48 hours of detention email.
 */
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import { getValidGmailAccessToken } from "@/lib/detention/gmailOAuth";
import {
  COMPLIANCE_WINDOW_MS,
  resolveDispatcherCompliance,
  type ComplianceValue,
} from "@/lib/detention/compliance";
import {
  canonicalDispatcherName,
  dispatcherMatchKeys,
} from "@/lib/detention/dispatcherNames";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function extractEmail(fromHeader: string): string | null {
  const m = String(fromHeader || "").match(
    /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/
  );
  return m ? m[0].toLowerCase() : null;
}

/**
 * Resolve dispatcher mailbox for compliance checks.
 * Tries TMS roster (all known name aliases), then email already saved on
 * other detentions for the same dispatcher (sibling backfill).
 */
async function lookupDispatcherEmail(
  dispatcherName: string | null
): Promise<string | null> {
  if (!dispatcherName?.trim()) return null;
  const pool = getPool();
  const keys = dispatcherMatchKeys(dispatcherName);
  const canonical = canonicalDispatcherName(dispatcherName);
  const nameCandidates = [
    ...new Set([dispatcherName.trim(), canonical].filter(Boolean)),
  ];

  try {
    // Roster match on all known name forms (aliases are lowercased keys)
    if (keys.length) {
      const placeholders = keys.map(() => "?").join(",");
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT email
           FROM tms_users
          WHERE email IS NOT NULL AND TRIM(email) <> ''
            AND LOWER(TRIM(CONCAT(COALESCE(first_name,''), ' ', COALESCE(last_name,''))))
                IN (${placeholders})
          LIMIT 1`,
        keys
      );
      const email = String(rows[0]?.email || "")
        .trim()
        .toLowerCase();
      if (email.includes("@")) return email;
    }

    for (const name of nameCandidates) {
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT email
           FROM tms_users
          WHERE email IS NOT NULL AND TRIM(email) <> ''
            AND LOWER(TRIM(CONCAT(COALESCE(first_name,''), ' ', COALESCE(last_name,'')))) = LOWER(?)
          LIMIT 1`,
        [name]
      );
      const email = String(rows[0]?.email || "")
        .trim()
        .toLowerCase();
      if (email.includes("@")) return email;
    }

    // Same dispatcher on another detention already has an email — reuse it.
    // Normalize trailing dots ("Alex M." → "alex m") to match alias keys.
    if (keys.length) {
      const placeholders = keys.map(() => "?").join(",");
      const [sib] = await pool.query<RowDataPacket[]>(
        `SELECT dispatcher_email AS email
           FROM detentions
          WHERE dispatcher_email IS NOT NULL AND TRIM(dispatcher_email) <> ''
            AND LOWER(TRIM(TRAILING '.' FROM TRIM(dispatcher))) IN (${placeholders})
          ORDER BY updated_at DESC
          LIMIT 1`,
        keys
      );
      const email = String(sib[0]?.email || "")
        .trim()
        .toLowerCase();
      if (email.includes("@")) return email;
    }
  } catch {
    return null;
  }
  return null;
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
}): {
  firstRepliedAt: Date | null;
  lastRepliedAt: Date | null;
  within48h: boolean;
} {
  const deadline = opts.emailStartMs + COMPLIANCE_WINDOW_MS;
  let firstRepliedAt: Date | null = null;
  let lastRepliedAt: Date | null = null;

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
    if (!firstRepliedAt || at < firstRepliedAt) firstRepliedAt = at;
    if (!lastRepliedAt || at > lastRepliedAt) lastRepliedAt = at;
  }

  if (!firstRepliedAt || !lastRepliedAt) {
    return { firstRepliedAt: null, lastRepliedAt: null, within48h: false };
  }
  return {
    firstRepliedAt,
    lastRepliedAt,
    within48h: firstRepliedAt.getTime() <= deadline,
  };
}

export type ComplianceScanResult = {
  checked: number;
  ok: number;
  missed: number;
  pending: number;
  noFollowUp: number;
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
    noFollowUp: 0,
    na: 0,
    errors: 0,
  };

  // Prefer rows needing a check: never checked, still pending, open claims, or missing email.
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, dispatcher, dispatcher_email, thread_id, message_id, email_date, created_at,
            status, dispatcher_compliance
       FROM detentions
      WHERE thread_id IS NOT NULL AND TRIM(thread_id) <> ''
        AND (
          dispatcher_compliance IS NULL
          OR dispatcher_compliance IN ('pending','missed','ok','no_follow_up')
          OR dispatcher_compliance_checked_at IS NULL
          OR (dispatcher_compliance = 'n/a' AND dispatcher_email IS NULL)
          OR status NOT IN ('Paid','Denied')
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

      const compliance: ComplianceValue = resolveDispatcherCompliance({
        status: String(row.status || "New"),
        emailDate: emailStart,
        repliedAt: reply.lastRepliedAt,
        nowMs: Date.now(),
      });

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
          reply.lastRepliedAt || reply.firstRepliedAt,
          reply.lastRepliedAt ? dispatcherEmail : null,
          reply.lastRepliedAt,
          compliance,
          row.id,
        ]
      );

      if (compliance === "ok") result.ok += 1;
      else if (compliance === "missed") result.missed += 1;
      else if (compliance === "no_follow_up") result.noFollowUp += 1;
      else if (compliance === "pending") result.pending += 1;
      else result.na += 1;
    } catch (e) {
      result.errors += 1;
      console.error("[detention-compliance]", row.id, (e as Error).message);
      await sleep(5_000);
    }
  }

  return result;
}
