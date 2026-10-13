import { randomBytes } from "crypto";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import { getPool } from "@/lib/db";
import { retentionExcludedDriversSql } from "@/lib/retention/rosterExclusions";

/** Local copy — avoid circular import with lib/retention/sms. */
function normalizePhoneE164(raw: string): string {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (trimmed.startsWith("+")) return `+${digits}`;
  return `+${digits}`;
}

export type SmsDirection = "outbound" | "inbound";
export type SmsSource =
  | "survey"
  | "reminder"
  | "occasion"
  | "resolution"
  | "manual"
  | "broadcast"
  | "inbound"
  | "legacy_survey"
  | "legacy_occasion";

export type DriverSmsMessage = {
  id: string;
  driverId: string;
  direction: SmsDirection;
  body: string;
  phone: string | null;
  provider: string | null;
  providerMessageId: string | null;
  source: string;
  sentBy: string | null;
  createdAt: string;
  /** True when synthesized from older Retention tables (not in driver_sms_messages). */
  legacy?: boolean;
};

function newId(): string {
  return randomBytes(12).toString("base64url").slice(0, 16);
}

export async function logDriverSms(input: {
  driverId: string | number;
  direction: SmsDirection;
  body: string;
  phone?: string | null;
  provider?: string | null;
  providerMessageId?: string | null;
  source?: string;
  sentBy?: string | null;
  createdAt?: string | Date | null;
}): Promise<DriverSmsMessage | null> {
  const driverId = String(input.driverId || "").trim();
  const body = String(input.body || "").trim();
  if (!driverId || !body) return null;

  const id = newId();
  const phone = input.phone
    ? normalizePhoneE164(input.phone) || String(input.phone).trim()
    : null;
  const source = String(input.source || "manual").slice(0, 64);
  const createdAt = input.createdAt
    ? new Date(input.createdAt)
    : new Date();

  const pool = getPool();
  await pool.query<ResultSetHeader>(
    `INSERT INTO driver_sms_messages
      (id, driver_id, direction, body, phone, provider, provider_message_id, source, sent_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      driverId,
      input.direction,
      body,
      phone,
      input.provider || null,
      input.providerMessageId || null,
      source,
      input.sentBy || null,
      createdAt,
    ]
  );

  return {
    id,
    driverId,
    direction: input.direction,
    body,
    phone,
    provider: input.provider || null,
    providerMessageId: input.providerMessageId || null,
    source,
    sentBy: input.sentBy || null,
    createdAt: createdAt.toISOString(),
  };
}

export async function findDriverIdByPhone(
  phoneRaw: string
): Promise<string | null> {
  const phone = normalizePhoneE164(phoneRaw) || String(phoneRaw || "").trim();
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  const last10 = digits.length >= 10 ? digits.slice(-10) : digits;
  if (!last10) return null;

  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id FROM drivers
     WHERE REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(phone,''), '+',''), '-',''), ' ',''), '(','')
           LIKE ?
     ORDER BY CASE WHEN LOWER(COALESCE(status,'')) IN ('active','employed') THEN 0 ELSE 1 END
     LIMIT 1`,
    [`%${last10}`]
  );
  if (!rows.length) return null;
  return String(rows[0].id);
}

function mapLogged(row: RowDataPacket): DriverSmsMessage {
  return {
    id: String(row.id),
    driverId: String(row.driver_id),
    direction: row.direction === "inbound" ? "inbound" : "outbound",
    body: String(row.body || ""),
    phone: row.phone != null ? String(row.phone) : null,
    provider: row.provider != null ? String(row.provider) : null,
    providerMessageId:
      row.provider_message_id != null ? String(row.provider_message_id) : null,
    source: String(row.source || "manual"),
    sentBy: row.sent_by != null ? String(row.sent_by) : null,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

/**
 * Full driver thread: logged messages + legacy Retention survey/occasion rows
 * that predate driver_sms_messages.
 */
export async function listDriverSmsThread(
  driverId: string | number
): Promise<DriverSmsMessage[]> {
  const id = String(driverId);
  const pool = getPool();
  const out: DriverSmsMessage[] = [];

  try {
    const [logged] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM driver_sms_messages
       WHERE driver_id = ?
       ORDER BY created_at ASC`,
      [id]
    );
    for (const row of logged) out.push(mapLogged(row));
  } catch {
    // Table may not exist until migrate runs — still show legacy.
  }

  const loggedKeys = new Set(
    out
      .map((m) => m.providerMessageId)
      .filter((x): x is string => Boolean(x))
  );
  const loggedBodiesAt = new Set(
    out.map((m) => `${m.createdAt.slice(0, 16)}|${m.body.slice(0, 80)}`)
  );

  const [occasions] = await pool.query<RowDataPacket[]>(
    `SELECT id, message_body, sent_at, occasion_type, holiday_name
     FROM retention_occasion_sends
     WHERE driver_id = ? AND sent_at IS NOT NULL
     ORDER BY sent_at ASC`,
    [id]
  );
  for (const row of occasions) {
    const body =
      String(row.message_body || "").trim() ||
      (row.occasion_type === "holiday"
        ? `Holiday greeting${row.holiday_name ? `: ${row.holiday_name}` : ""}`
        : row.occasion_type === "birthday"
          ? "Birthday greeting"
          : "Anniversary greeting");
    const createdAt = new Date(row.sent_at).toISOString();
    const key = `${createdAt.slice(0, 16)}|${body.slice(0, 80)}`;
    if (loggedBodiesAt.has(key)) continue;
    out.push({
      id: `legacy-occ-${row.id}`,
      driverId: id,
      direction: "outbound",
      body,
      phone: null,
      provider: null,
      providerMessageId: null,
      source: "legacy_occasion",
      sentBy: null,
      createdAt,
      legacy: true,
    });
  }

  const [surveys] = await pool.query<RowDataPacket[]>(
    `SELECT id, sent_at, survey_kind, triggered_by, provider_message_id, reminder_count
     FROM retention_survey_occurrences
     WHERE driver_id = ? AND sent_at IS NOT NULL
     ORDER BY sent_at ASC`,
    [id]
  );
  for (const row of surveys) {
    const pmid =
      row.provider_message_id != null ? String(row.provider_message_id) : null;
    if (pmid && loggedKeys.has(pmid)) continue;
    const kind = String(row.survey_kind || "regular");
    const body =
      kind === "resolution"
        ? "Resolution follow-up survey sent"
        : Number(row.reminder_count || 0) > 0
          ? "Survey reminder sent"
          : "Survey request sent";
    const createdAt = new Date(row.sent_at).toISOString();
    out.push({
      id: `legacy-surv-${row.id}`,
      driverId: id,
      direction: "outbound",
      body,
      phone: null,
      provider: null,
      providerMessageId: pmid,
      source: "legacy_survey",
      sentBy: row.triggered_by === "admin" ? "Admin" : "System",
      createdAt,
      legacy: true,
    });
  }

  out.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  return out;
}

export async function listActiveDriversForComms(opts?: {
  q?: string;
  limit?: number;
}): Promise<
  {
    id: string;
    name: string;
    phone: string | null;
    status: string;
    lastMessageAt: string | null;
    lastMessagePreview: string | null;
  }[]
> {
  const pool = getPool();
  const limit = Math.min(Math.max(opts?.limit || 200, 1), 500);
  const q = String(opts?.q || "").trim();

  const nameSql = `TRIM(CONCAT_WS(' ', d.first_name, d.middle_name, d.last_name))`;
  const params: (string | number)[] = [];
  // Hide test/staff accounts (Accounting example, Milos, etc.) — same IDs as Retention.
  let where =
    `WHERE (LOWER(COALESCE(d.status,'')) IN ('active','employed') OR d.status IS NULL OR d.status = '')` +
    retentionExcludedDriversSql("d");
  if (q) {
    where += ` AND (${nameSql} LIKE ? OR d.phone LIKE ? OR CAST(d.id AS CHAR) LIKE ?)`;
    const like = `%${q}%`;
    params.push(like, like, like);
  }

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT d.id, ${nameSql} AS name, d.phone, d.status,
            (SELECT m.body FROM driver_sms_messages m
             WHERE m.driver_id = d.id ORDER BY m.created_at DESC LIMIT 1) AS last_body,
            (SELECT m.created_at FROM driver_sms_messages m
             WHERE m.driver_id = d.id ORDER BY m.created_at DESC LIMIT 1) AS last_at
     FROM drivers d
     ${where}
     ORDER BY COALESCE(
       (SELECT m.created_at FROM driver_sms_messages m
        WHERE m.driver_id = d.id ORDER BY m.created_at DESC LIMIT 1),
       '1970-01-01'
     ) DESC, name ASC
     LIMIT ${limit}`,
    params
  );

  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name || "Driver"),
    phone: r.phone != null ? String(r.phone) : null,
    status: String(r.status || ""),
    lastMessageAt: r.last_at ? new Date(r.last_at).toISOString() : null,
    lastMessagePreview: r.last_body != null ? String(r.last_body) : null,
  }));
}
