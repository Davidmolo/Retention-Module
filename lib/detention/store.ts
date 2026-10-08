import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import {
  canonicalDispatcherName,
  dispatcherMatchKeys,
  uniqueCanonicalDispatchers,
} from "./dispatcherNames";
import {
  DETENTION_STATUSES,
  type Detention,
  type DetentionHistoryEvent,
  type DetentionKpis,
  type DetentionListItem,
  type DetentionNote,
  type DetentionStatus,
  isDetentionStatus,
} from "./types";

interface DetentionRow extends RowDataPacket {
  id: string;
  customer: string | null;
  customer_email: string | null;
  dispatcher: string | null;
  dispatcher_email: string | null;
  load_number: string | null;
  shipment_number: string | null;
  driver_name: string | null;
  driver_number: string | null;
  truck_number: string | null;
  stop_type: string | null;
  pu_location: string | null;
  pu_appt: string | null;
  del_location: string | null;
  del_appt: string | null;
  arrival_time: string | null;
  detention_start: string | null;
  driver_departure: string | null;
  detention_mins: number | null;
  detention_time_label: string | null;
  rate_per_hour: string | number;
  amount: string | number | null;
  billable_amount: string | number | null;
  settled_amount: string | number | null;
  status: string;
  awaiting_us: number;
  follow_up_date: Date | string | null;
  load_link: string | null;
  thread_url: string | null;
  message_id: string | null;
  thread_id: string | null;
  calendar_event_id: string | null;
  email_date: Date | string | null;
  last_reply_from: string | null;
  last_reply_at: Date | string | null;
  dispatcher_replied_at: Date | string | null;
  dispatcher_compliance: string | null;
  dispatcher_compliance_checked_at: Date | string | null;
  history_json: string | DetentionHistoryEvent[] | null;
  source: string;
  created_at: Date | string;
  updated_at: Date | string;
  note_count?: number;
}

interface NoteRow extends RowDataPacket {
  id: number;
  detention_id: string;
  author: string | null;
  body: string;
  created_at: Date | string;
}

function toIso(v: Date | string | null | undefined): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString();
}

function toDateOnly(v: Date | string | null | undefined): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) {
    return v.slice(0, 10);
  }
  const iso = toIso(v);
  return iso ? iso.slice(0, 10) : null;
}

function toNum(v: string | number | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseHistory(
  raw: string | DetentionHistoryEvent[] | null | undefined
): DetentionHistoryEvent[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mapDetention(row: DetentionRow): Detention {
  const status = isDetentionStatus(row.status) ? row.status : row.status;
  return {
    id: row.id,
    customer: row.customer,
    customerEmail: row.customer_email,
    dispatcher: row.dispatcher
      ? canonicalDispatcherName(row.dispatcher)
      : null,
    dispatcherEmail: row.dispatcher_email ?? null,
    loadNumber: row.load_number,
    shipmentNumber: row.shipment_number,
    driverName: row.driver_name,
    driverNumber: row.driver_number,
    truckNumber: row.truck_number,
    stopType: row.stop_type,
    puLocation: row.pu_location,
    puAppt: row.pu_appt,
    delLocation: row.del_location,
    delAppt: row.del_appt,
    arrivalTime: row.arrival_time,
    detentionStart: row.detention_start,
    driverDeparture: row.driver_departure,
    detentionMins: row.detention_mins == null ? null : Number(row.detention_mins),
    detentionTimeLabel: row.detention_time_label,
    ratePerHour: toNum(row.rate_per_hour) ?? 25,
    amount: toNum(row.amount),
    billableAmount: toNum(row.billable_amount),
    settledAmount: toNum(row.settled_amount),
    status,
    awaitingUs: Boolean(row.awaiting_us),
    followUpDate: toDateOnly(row.follow_up_date),
    loadLink: row.load_link,
    threadUrl: row.thread_url,
    messageId: row.message_id,
    threadId: row.thread_id,
    calendarEventId: row.calendar_event_id,
    emailDate: toIso(row.email_date),
    lastReplyFrom: row.last_reply_from,
    lastReplyAt: toIso(row.last_reply_at),
    dispatcherRepliedAt: toIso(row.dispatcher_replied_at),
    dispatcherCompliance: row.dispatcher_compliance ?? null,
    dispatcherComplianceCheckedAt: toIso(row.dispatcher_compliance_checked_at),
    history: parseHistory(row.history_json),
    source: row.source || "import",
    createdAt: toIso(row.created_at) || new Date().toISOString(),
    updatedAt: toIso(row.updated_at) || new Date().toISOString(),
  };
}

const SELECT_COLS = `
  id, customer, customer_email, dispatcher, dispatcher_email, load_number, shipment_number,
  driver_name, driver_number, truck_number, stop_type,
  pu_location, pu_appt, del_location, del_appt,
  arrival_time, detention_start, driver_departure, detention_mins,
  detention_time_label, rate_per_hour, amount, billable_amount, settled_amount,
  status, awaiting_us, follow_up_date, load_link, thread_url,
  message_id, thread_id, calendar_event_id, email_date,
  last_reply_from, last_reply_at, dispatcher_replied_at, dispatcher_compliance,
  dispatcher_compliance_checked_at, history_json, source, created_at, updated_at
`;

export type DetentionSort =
  | "default"
  | "emailDateDesc"
  | "emailDateAsc";

export type ListDetentionsOpts = {
  status?: string;
  search?: string;
  dispatcher?: string;
  awaitingUs?: boolean;
  followUpDue?: boolean;
  /** YYYY-MM-DD — match email received date (falls back to created_at). */
  emailDate?: string;
  sort?: DetentionSort;
  /** 1-based page number */
  page?: number;
  /** Rows per page (default 25, max 100) */
  pageSize?: number;
};

export type DetentionListResult = {
  items: DetentionListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

function isYmd(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

/** Calendar date of the detention email (or created_at when email_date is empty). */
const EMAIL_DAY_EXPR = "DATE(COALESCE(d.email_date, d.created_at))";

function buildDetentionListWhere(opts: ListDetentionsOpts): {
  conds: string[];
  params: unknown[];
} {
  const conds: string[] = ["1=1"];
  const params: unknown[] = [];

  if (opts.status && opts.status !== "all") {
    conds.push("d.status = ?");
    params.push(opts.status);
  }
  if (opts.dispatcher?.trim()) {
    const keys = dispatcherMatchKeys(opts.dispatcher);
    if (keys.length === 1) {
      conds.push("LOWER(TRIM(d.dispatcher)) = ?");
      params.push(keys[0]);
    } else if (keys.length > 1) {
      conds.push(
        `LOWER(TRIM(d.dispatcher)) IN (${keys.map(() => "?").join(",")})`
      );
      params.push(...keys);
    }
  }
  if (opts.awaitingUs) {
    conds.push("d.awaiting_us = 1");
  }
  if (opts.followUpDue) {
    conds.push("d.follow_up_date IS NOT NULL AND d.follow_up_date <= CURDATE()");
    conds.push("d.status NOT IN ('Paid','Denied')");
  }
  if (isYmd(opts.emailDate)) {
    conds.push(`${EMAIL_DAY_EXPR} = ?`);
    params.push(opts.emailDate);
  }
  if (opts.search?.trim()) {
    const q = `%${opts.search.trim()}%`;
    conds.push(
      `(d.customer LIKE ? OR d.driver_name LIKE ? OR d.load_number LIKE ?
        OR d.shipment_number LIKE ? OR d.dispatcher LIKE ? OR d.truck_number LIKE ?)`
    );
    params.push(q, q, q, q, q, q);
  }
  return { conds, params };
}

export async function listDetentions(
  opts: ListDetentionsOpts = {}
): Promise<DetentionListResult> {
  const pool = getPool();
  const { conds, params } = buildDetentionListWhere(opts);
  const whereSql = conds.join(" AND ");

  // Default + filters: newest email first (open claims still above Paid/Denied)
  let orderBy = `
        CASE WHEN d.status IN ('Paid','Denied') THEN 1 ELSE 0 END,
        COALESCE(d.email_date, d.created_at) DESC,
        d.id DESC`;
  if (opts.sort === "emailDateAsc") {
    orderBy = `COALESCE(d.email_date, d.created_at) ASC, d.id ASC`;
  } else if (opts.sort === "emailDateDesc") {
    orderBy = `COALESCE(d.email_date, d.created_at) DESC, d.id DESC`;
  }

  const pageSize = Math.min(100, Math.max(1, Number(opts.pageSize) || 25));
  const page = Math.max(1, Number(opts.page) || 1);
  const offset = (page - 1) * pageSize;

  const [countRows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM detentions d WHERE ${whereSql}`,
    params
  );
  const total = Number(countRows[0]?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const [rows] = await pool.query<DetentionRow[]>(
    `SELECT d.*,
            (SELECT COUNT(*) FROM detention_notes n WHERE n.detention_id = d.id) AS note_count
       FROM detentions d
      WHERE ${whereSql}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  return {
    items: rows.map((r) => ({
      ...mapDetention(r),
      noteCount: Number(r.note_count || 0),
    })),
    total,
    page,
    pageSize,
    totalPages,
  };
}

export async function getDetentionKpis(): Promise<DetentionKpis> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN status NOT IN ('Paid','Denied') THEN 1 ELSE 0 END) AS open_count,
       SUM(CASE WHEN awaiting_us = 1 AND status NOT IN ('Paid','Denied') THEN 1 ELSE 0 END) AS awaiting_count,
       SUM(CASE WHEN follow_up_date IS NOT NULL AND follow_up_date <= CURDATE()
                 AND status NOT IN ('Paid','Denied') THEN 1 ELSE 0 END) AS follow_up_count,
       SUM(CASE WHEN status = 'Paid' THEN 1 ELSE 0 END) AS paid_count,
       SUM(CASE WHEN status NOT IN ('Paid','Denied') THEN COALESCE(amount,0) ELSE 0 END) AS open_amount,
       SUM(CASE WHEN status = 'Paid' THEN COALESCE(settled_amount, amount, 0) ELSE 0 END) AS paid_amount
     FROM detentions`
  );
  const r = rows[0] || {};
  return {
    total: Number(r.total || 0),
    open: Number(r.open_count || 0),
    awaitingUs: Number(r.awaiting_count || 0),
    followUpDue: Number(r.follow_up_count || 0),
    paid: Number(r.paid_count || 0),
    openAmount: Number(r.open_amount || 0),
    paidAmount: Number(r.paid_amount || 0),
  };
}

export async function listDetentionDispatchers(): Promise<string[]> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT DISTINCT dispatcher
       FROM detentions
      WHERE dispatcher IS NOT NULL AND TRIM(dispatcher) <> ''
      ORDER BY dispatcher ASC`
  );
  return uniqueCanonicalDispatchers(rows.map((r) => String(r.dispatcher)));
}

export async function getDetention(id: string): Promise<Detention | null> {
  const pool = getPool();
  const [rows] = await pool.query<DetentionRow[]>(
    `SELECT ${SELECT_COLS} FROM detentions WHERE id = ? LIMIT 1`,
    [id]
  );
  return rows[0] ? mapDetention(rows[0]) : null;
}

export async function listDetentionNotes(
  detentionId: string
): Promise<DetentionNote[]> {
  const pool = getPool();
  const [rows] = await pool.query<NoteRow[]>(
    `SELECT id, detention_id, author, body, created_at
       FROM detention_notes
      WHERE detention_id = ?
      ORDER BY created_at DESC`,
    [detentionId]
  );
  return rows.map((r) => ({
    id: r.id,
    detentionId: r.detention_id,
    author: r.author,
    body: r.body,
    createdAt: toIso(r.created_at) || new Date().toISOString(),
  }));
}

export async function addDetentionNote(opts: {
  detentionId: string;
  author: string | null;
  body: string;
}): Promise<DetentionNote> {
  const pool = getPool();
  const body = opts.body.trim();
  if (!body) {
    const err = new Error("Note cannot be empty");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  const [res] = await pool.query<ResultSetHeader>(
    `INSERT INTO detention_notes (detention_id, author, body) VALUES (?, ?, ?)`,
    [opts.detentionId, opts.author, body]
  );
  await appendHistory(opts.detentionId, {
    type: "comment",
    timestamp: new Date().toISOString(),
    user: opts.author || "user",
    text: body,
  });
  return {
    id: res.insertId,
    detentionId: opts.detentionId,
    author: opts.author,
    body,
    createdAt: new Date().toISOString(),
  };
}

async function appendHistory(
  id: string,
  event: DetentionHistoryEvent
): Promise<void> {
  const pool = getPool();
  const current = await getDetention(id);
  if (!current) return;
  const history = [...current.history, event];
  await pool.query(`UPDATE detentions SET history_json = ? WHERE id = ?`, [
    JSON.stringify(history),
    id,
  ]);
}

export type UpdateDetentionPatch = {
  status?: string;
  awaitingUs?: boolean;
  followUpDate?: string | null;
  settledAmount?: number | null;
  actor?: string | null;
};

export async function updateDetention(
  id: string,
  patch: UpdateDetentionPatch
): Promise<Detention> {
  const current = await getDetention(id);
  if (!current) {
    const err = new Error("Detention not found");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }

  const pool = getPool();
  const sets: string[] = [];
  const params: unknown[] = [];
  const actor = patch.actor || "user";
  const events: DetentionHistoryEvent[] = [];

  if (patch.status != null && patch.status !== current.status) {
    if (!isDetentionStatus(patch.status)) {
      const err = new Error(
        `Invalid status. Use one of: ${DETENTION_STATUSES.join(", ")}`
      );
      (err as Error & { status?: number }).status = 400;
      throw err;
    }
    sets.push("status = ?");
    params.push(patch.status);
    events.push({
      type: "update",
      timestamp: new Date().toISOString(),
      user: actor,
      field: "Status",
      from: current.status,
      to: patch.status,
    });
  }

  if (
    patch.awaitingUs != null &&
    Boolean(patch.awaitingUs) !== current.awaitingUs
  ) {
    sets.push("awaiting_us = ?");
    params.push(patch.awaitingUs ? 1 : 0);
    events.push({
      type: "update",
      timestamp: new Date().toISOString(),
      user: actor,
      field: "Awaiting Us",
      from: current.awaitingUs ? "YES" : "NO",
      to: patch.awaitingUs ? "YES" : "NO",
    });
  }

  if (patch.followUpDate !== undefined) {
    const next = patch.followUpDate ? patch.followUpDate.slice(0, 10) : null;
    if (next !== current.followUpDate) {
      sets.push("follow_up_date = ?");
      params.push(next);
      events.push({
        type: "update",
        timestamp: new Date().toISOString(),
        user: actor,
        field: "Follow Up Date",
        from: current.followUpDate || "",
        to: next || "",
      });
    }
  }

  if (patch.settledAmount !== undefined) {
    const next = patch.settledAmount;
    if (next !== current.settledAmount) {
      sets.push("settled_amount = ?");
      params.push(next);
      events.push({
        type: "update",
        timestamp: new Date().toISOString(),
        user: actor,
        field: "Settled Amount",
        from: current.settledAmount == null ? "" : String(current.settledAmount),
        to: next == null ? "" : String(next),
      });
    }
  }

  if (!sets.length) return current;

  params.push(id);
  await pool.query(
    `UPDATE detentions SET ${sets.join(", ")} WHERE id = ?`,
    params
  );

  for (const ev of events) {
    await appendHistory(id, ev);
  }

  const updated = await getDetention(id);
  if (!updated) {
    const err = new Error("Detention not found after update");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  return updated;
}

export type UpsertDetentionInput = {
  id: string;
  customer?: string | null;
  customerEmail?: string | null;
  dispatcher?: string | null;
  dispatcherEmail?: string | null;
  loadNumber?: string | null;
  shipmentNumber?: string | null;
  driverName?: string | null;
  driverNumber?: string | null;
  truckNumber?: string | null;
  stopType?: string | null;
  puLocation?: string | null;
  puAppt?: string | null;
  delLocation?: string | null;
  delAppt?: string | null;
  arrivalTime?: string | null;
  detentionStart?: string | null;
  driverDeparture?: string | null;
  detentionMins?: number | null;
  detentionTimeLabel?: string | null;
  ratePerHour?: number;
  amount?: number | null;
  billableAmount?: number | null;
  settledAmount?: number | null;
  status?: string;
  awaitingUs?: boolean;
  followUpDate?: string | null;
  loadLink?: string | null;
  threadUrl?: string | null;
  messageId?: string | null;
  threadId?: string | null;
  calendarEventId?: string | null;
  emailDate?: string | null;
  lastReplyFrom?: string | null;
  lastReplyAt?: string | null;
  history?: DetentionHistoryEvent[];
  source?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export async function upsertDetention(
  input: UpsertDetentionInput
): Promise<void> {
  const pool = getPool();
  const status =
    input.status && isDetentionStatus(input.status) ? input.status : "New";
  const createdAt = input.createdAt || new Date().toISOString().slice(0, 23).replace("T", " ");
  const updatedAt = input.updatedAt || createdAt;
  const dispatcher =
    input.dispatcher?.trim()
      ? canonicalDispatcherName(input.dispatcher)
      : null;
  await pool.query(
    `INSERT INTO detentions (
      id, customer, customer_email, dispatcher, dispatcher_email, load_number, shipment_number,
      driver_name, driver_number, truck_number, stop_type,
      pu_location, pu_appt, del_location, del_appt,
      arrival_time, detention_start, driver_departure, detention_mins,
      detention_time_label, rate_per_hour, amount, billable_amount, settled_amount,
      status, awaiting_us, follow_up_date, load_link, thread_url,
      message_id, thread_id, calendar_event_id, email_date,
      last_reply_from, last_reply_at, history_json, source, created_at, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON DUPLICATE KEY UPDATE
      customer = VALUES(customer),
      customer_email = VALUES(customer_email),
      dispatcher = VALUES(dispatcher),
      dispatcher_email = VALUES(dispatcher_email),
      load_number = VALUES(load_number),
      shipment_number = VALUES(shipment_number),
      driver_name = VALUES(driver_name),
      driver_number = VALUES(driver_number),
      truck_number = VALUES(truck_number),
      stop_type = VALUES(stop_type),
      pu_location = VALUES(pu_location),
      pu_appt = VALUES(pu_appt),
      del_location = VALUES(del_location),
      del_appt = VALUES(del_appt),
      arrival_time = VALUES(arrival_time),
      detention_start = VALUES(detention_start),
      driver_departure = VALUES(driver_departure),
      detention_mins = VALUES(detention_mins),
      detention_time_label = VALUES(detention_time_label),
      rate_per_hour = VALUES(rate_per_hour),
      amount = VALUES(amount),
      billable_amount = VALUES(billable_amount),
      settled_amount = VALUES(settled_amount),
      status = VALUES(status),
      awaiting_us = VALUES(awaiting_us),
      follow_up_date = VALUES(follow_up_date),
      load_link = VALUES(load_link),
      thread_url = VALUES(thread_url),
      message_id = VALUES(message_id),
      thread_id = VALUES(thread_id),
      calendar_event_id = VALUES(calendar_event_id),
      email_date = VALUES(email_date),
      last_reply_from = VALUES(last_reply_from),
      last_reply_at = VALUES(last_reply_at),
      history_json = VALUES(history_json),
      source = VALUES(source),
      updated_at = VALUES(updated_at)`,
    [
      input.id,
      input.customer ?? null,
      input.customerEmail ?? null,
      dispatcher,
      input.dispatcherEmail ?? null,
      input.loadNumber ?? null,
      input.shipmentNumber ?? null,
      input.driverName ?? null,
      input.driverNumber ?? null,
      input.truckNumber ?? null,
      input.stopType ?? null,
      input.puLocation ?? null,
      input.puAppt ?? null,
      input.delLocation ?? null,
      input.delAppt ?? null,
      input.arrivalTime ?? null,
      input.detentionStart ?? null,
      input.driverDeparture ?? null,
      input.detentionMins ?? null,
      input.detentionTimeLabel ?? null,
      input.ratePerHour ?? 25,
      input.amount ?? null,
      input.billableAmount ?? null,
      input.settledAmount ?? null,
      status,
      input.awaitingUs === false ? 0 : 1,
      input.followUpDate ?? null,
      input.loadLink ?? null,
      input.threadUrl ?? null,
      input.messageId ?? null,
      input.threadId ?? null,
      input.calendarEventId ?? null,
      input.emailDate ?? null,
      input.lastReplyFrom ?? null,
      input.lastReplyAt ?? null,
      JSON.stringify(input.history || []),
      input.source || "import",
      createdAt,
      updatedAt,
    ]
  );
}

export { DETENTION_STATUSES };
export type { DetentionStatus };
