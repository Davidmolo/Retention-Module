/**
 * Poll ar@ for OpenRoad Detention completed emails and create claims.
 * Idempotent via detention_gmail_intake_log + detentions.message_id.
 */
import { nanoid } from "nanoid";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import {
  getDetentionMessage,
  gmailThreadUrl,
  listDetentionMessageIds,
} from "@/lib/detention/gmailClient";
import {
  isBelowMinBillable,
  parseOpenRoadDetentionEmail,
} from "@/lib/detention/parseOpenRoadEmail";
import { upsertDetention } from "@/lib/detention/store";
import { getDetentionGmailConnection } from "@/lib/detention/gmailOAuth";

export type IntakeRunResult = {
  ok: boolean;
  mailbox: string | null;
  lookbackDays: number;
  listed: number;
  imported: number;
  skippedDuplicate: number;
  skippedLowAmount: number;
  skippedParse: number;
  errors: number;
  details: {
    gmailMessageId: string;
    result: string;
    detentionId?: string | null;
    detail?: string | null;
  }[];
};

function envInt(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function toMysqlDateTime(d: Date | null): string | null {
  if (!d || Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 23).replace("T", " ");
}

function followUpDateYmd(daysAhead = 3): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

/** Terminal outcomes only — transient `error` rows must be retried. */
async function alreadyLogged(gmailMessageId: string): Promise<boolean> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT gmail_message_id FROM detention_gmail_intake_log
      WHERE gmail_message_id = ?
        AND result IN ('imported','skipped_duplicate','skipped_low_amount','skipped_parse')
      LIMIT 1`,
    [gmailMessageId]
  );
  return Boolean(rows[0]);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isTransientGmailError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("quota") ||
    m.includes("rate limit") ||
    m.includes("user-rate limit") ||
    m.includes("backend error") ||
    m.includes("unavailable") ||
    m.includes("timed out") ||
    m.includes("econnreset") ||
    m.includes("503") ||
    m.includes("429")
  );
}

async function detentionExistsByMessageId(
  messageId: string
): Promise<string | null> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id FROM detentions WHERE message_id = ? LIMIT 1`,
    [messageId]
  );
  return rows[0]?.id ? String(rows[0].id) : null;
}

async function writeLog(opts: {
  gmailMessageId: string;
  gmailThreadId: string | null;
  detentionId: string | null;
  subject: string | null;
  result: string;
  detail?: string | null;
}): Promise<void> {
  const pool = getPool();
  await pool.query<ResultSetHeader>(
    `INSERT INTO detention_gmail_intake_log (
       gmail_message_id, gmail_thread_id, detention_id, subject, result, detail
     ) VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       gmail_thread_id = VALUES(gmail_thread_id),
       detention_id = VALUES(detention_id),
       subject = VALUES(subject),
       result = VALUES(result),
       detail = VALUES(detail),
       processed_at = CURRENT_TIMESTAMP(3)`,
    [
      opts.gmailMessageId,
      opts.gmailThreadId,
      opts.detentionId,
      opts.subject,
      opts.result,
      opts.detail ?? null,
    ]
  );
}

async function lookupDispatcher(
  driverNumber: string | null
): Promise<{ name: string | null; email: string | null }> {
  if (!driverNumber?.trim()) return { name: null, email: null };
  const pool = getPool();
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) AS name,
              u.email AS email
         FROM tms_drivers d
         LEFT JOIN tms_users u ON u.id = d.manager_id
        WHERE d.driver_nr = ?
        LIMIT 1`,
      [driverNumber.trim()]
    );
    const name = String(rows[0]?.name || "").trim() || null;
    const email = String(rows[0]?.email || "")
      .trim()
      .toLowerCase();
    return {
      name,
      email: email.includes("@") ? email : null,
    };
  } catch {
    return { name: null, email: null };
  }
}

export async function runDetentionEmailIntake(opts?: {
  lookbackDays?: number;
  maxMessages?: number;
}): Promise<IntakeRunResult> {
  const lookbackDays =
    opts?.lookbackDays ?? envInt("DETENTION_GMAIL_LOOKBACK_DAYS", 14);
  const maxMessages =
    opts?.maxMessages ?? envInt("DETENTION_GMAIL_MAX_PER_RUN", 2000);

  const connection = await getDetentionGmailConnection();
  const result: IntakeRunResult = {
    ok: true,
    mailbox: connection.email,
    lookbackDays,
    listed: 0,
    imported: 0,
    skippedDuplicate: 0,
    skippedLowAmount: 0,
    skippedParse: 0,
    errors: 0,
    details: [],
  };

  if (!connection.connected || !connection.oauthConfigured) {
    result.ok = false;
    result.details.push({
      gmailMessageId: "-",
      result: "error",
      detail: "ar@ mailbox is not connected or OAuth is not configured",
    });
    return result;
  }

  const listed = await listDetentionMessageIds({
    lookbackDays,
    maxResults: maxMessages,
  });
  result.listed = listed.length;

  // Pace Gmail gets so we stay under per-user query quota (~250 units/min).
  // messages.get ≈ 5 units → ~25–40/min is safe; use 400ms between calls.
  const paceMs = envInt("DETENTION_GMAIL_PACE_MS", 400);

  for (const item of listed) {
    try {
      if (await alreadyLogged(item.id)) {
        result.skippedDuplicate += 1;
        continue;
      }

      const existing = await detentionExistsByMessageId(item.id);
      if (existing) {
        await writeLog({
          gmailMessageId: item.id,
          gmailThreadId: item.threadId,
          detentionId: existing,
          subject: null,
          result: "skipped_duplicate",
          detail: "Already in detentions by message_id",
        });
        result.skippedDuplicate += 1;
        result.details.push({
          gmailMessageId: item.id,
          result: "skipped_duplicate",
          detentionId: existing,
        });
        continue;
      }

      await sleep(paceMs);
      let msg;
      try {
        msg = await getDetentionMessage(item.id);
      } catch (fetchErr) {
        const detail = (fetchErr as Error).message || "gmail get failed";
        if (isTransientGmailError(detail)) {
          // Do not write a terminal log — retry next poll.
          result.errors += 1;
          result.details.push({
            gmailMessageId: item.id,
            result: "retry_later",
            detail,
          });
          // Back off the rest of this run to protect quota.
          await sleep(15_000);
          continue;
        }
        throw fetchErr;
      }
      const parsed = parseOpenRoadDetentionEmail({
        subject: msg.subject,
        plainBody: msg.plainBody,
        htmlBody: msg.htmlBody,
        to: msg.to,
        cc: msg.cc,
      });

      if (!parsed) {
        await writeLog({
          gmailMessageId: item.id,
          gmailThreadId: item.threadId,
          detentionId: null,
          subject: msg.subject,
          result: "skipped_parse",
          detail: "Could not parse as Detention completed notice",
        });
        result.skippedParse += 1;
        result.details.push({
          gmailMessageId: item.id,
          result: "skipped_parse",
          detail: msg.subject,
        });
        continue;
      }

      if (isBelowMinBillable(parsed.amount)) {
        await writeLog({
          gmailMessageId: item.id,
          gmailThreadId: item.threadId,
          detentionId: null,
          subject: msg.subject,
          result: "skipped_low_amount",
          detail: `Amount $${parsed.amount} below minimum $50`,
        });
        result.skippedLowAmount += 1;
        result.details.push({
          gmailMessageId: item.id,
          result: "skipped_low_amount",
          detail: `$${parsed.amount}`,
        });
        continue;
      }

      const dispatcherLookup = await lookupDispatcher(parsed.driverNumber);
      const dispatcher =
        dispatcherLookup.name || parsed.dispatcherHint || null;
      const dispatcherEmail = dispatcherLookup.email;

      const id = nanoid(16);
      const emailDate =
        toMysqlDateTime(msg.internalDate) ||
        toMysqlDateTime(
          msg.dateHeader ? new Date(msg.dateHeader) : null
        );

      await upsertDetention({
        id,
        customer: parsed.customer,
        customerEmail: parsed.customerEmail,
        dispatcher,
        dispatcherEmail,
        loadNumber: parsed.loadNumber,
        shipmentNumber: parsed.shipmentNumber,
        driverName: parsed.driverName,
        driverNumber: parsed.driverNumber,
        truckNumber: parsed.truckNumber,
        stopType: parsed.stopType,
        puLocation: parsed.puLocation,
        puAppt: parsed.puAppt,
        delLocation: parsed.delLocation,
        delAppt: parsed.delAppt,
        arrivalTime: parsed.arrivalTime,
        detentionStart: parsed.detentionStart,
        driverDeparture: parsed.driverDeparture,
        detentionMins: parsed.detentionMins,
        detentionTimeLabel: parsed.detentionTimeLabel,
        ratePerHour: parsed.ratePerHour,
        amount: parsed.amount,
        billableAmount: parsed.amount,
        status: "New",
        awaitingUs: true,
        followUpDate: followUpDateYmd(3),
        loadLink: parsed.loadLink,
        threadUrl: gmailThreadUrl(msg.threadId),
        messageId: msg.id,
        threadId: msg.threadId,
        emailDate,
        history: [
          {
            type: "created",
            timestamp: new Date().toISOString(),
            user: "gmail-intake",
            text: `Imported from OpenRoad email: ${parsed.subject}`,
          },
        ],
        source: "gmail_intake",
      });

      await writeLog({
        gmailMessageId: item.id,
        gmailThreadId: item.threadId,
        detentionId: id,
        subject: msg.subject,
        result: "imported",
        detail: `Load ${parsed.loadNumber || "—"} · $${parsed.amount}`,
      });
      result.imported += 1;
      result.details.push({
        gmailMessageId: item.id,
        result: "imported",
        detentionId: id,
        detail: parsed.loadNumber || parsed.shipmentNumber || undefined,
      });
    } catch (e) {
      result.errors += 1;
      const detail = (e as Error).message || "intake error";
      const transient = isTransientGmailError(detail);
      if (!transient) {
        try {
          await writeLog({
            gmailMessageId: item.id,
            gmailThreadId: item.threadId,
            detentionId: null,
            subject: null,
            result: "error",
            detail,
          });
        } catch {
          /* ignore log failure */
        }
      }
      result.details.push({
        gmailMessageId: item.id,
        result: transient ? "retry_later" : "error",
        detail,
      });
      console.error("[detention-intake]", item.id, detail);
      if (transient) await sleep(15_000);
    }
  }

  result.ok = result.errors === 0;
  return result;
}
