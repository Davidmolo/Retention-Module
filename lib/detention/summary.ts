import type { RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import {
  isArMailbox,
  resolveArCompliance,
  resolveDispatcherCompliance,
} from "@/lib/detention/compliance";
import {
  canonicalDispatcherName,
  dispatcherMatchKeys,
  uniqueCanonicalDispatchers,
} from "@/lib/detention/dispatcherNames";
import { weekOf, weekRange } from "@/lib/week";
import type {
  DetentionComplianceGroup,
  DetentionComplianceItem,
  DetentionComplianceWeek,
  DetentionDispatcherSummary,
  DetentionPartyRow,
  DetentionPeriodSummary,
} from "@/lib/detention/types";

const EMAIL_DAY = "DATE(COALESCE(email_date, created_at))";

export type DetentionSummaryFilters = {
  /** Only claims with email/created date within the last N days (0 = all). */
  days?: number;
  status?: string;
  dispatcher?: string;
  /** YYYY-MM-DD — match email received date. */
  emailDate?: string;
};

function money(n: unknown): number {
  const v = Number(n || 0);
  return Number.isFinite(v) ? v : 0;
}

function isYmd(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function buildSummaryWhere(opts: DetentionSummaryFilters = {}): {
  whereSql: string;
  params: unknown[];
} {
  const conds: string[] = ["COALESCE(email_date, created_at) IS NOT NULL"];
  const params: unknown[] = [];

  if (opts.status && opts.status !== "all") {
    conds.push("status = ?");
    params.push(opts.status);
  }
  if (opts.dispatcher?.trim() && opts.dispatcher !== "all") {
    const keys = dispatcherMatchKeys(opts.dispatcher);
    if (keys.length === 1) {
      conds.push("LOWER(TRIM(dispatcher)) = ?");
      params.push(keys[0]);
    } else if (keys.length > 1) {
      conds.push(
        `LOWER(TRIM(dispatcher)) IN (${keys.map(() => "?").join(",")})`
      );
      params.push(...keys);
    }
  }
  if (isYmd(opts.emailDate)) {
    conds.push(`${EMAIL_DAY} = ?`);
    params.push(opts.emailDate);
  }
  const days = Number(opts.days);
  if (Number.isFinite(days) && days > 0) {
    conds.push(`${EMAIL_DAY} >= DATE_SUB(CURDATE(), INTERVAL ? DAY)`);
    params.push(Math.floor(days));
  }

  return { whereSql: conds.join(" AND "), params };
}

/** Canonical dispatcher names for the Summary filter dropdown (unfiltered). */
export async function listDetentionSummaryDispatchers(): Promise<string[]> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT DISTINCT TRIM(dispatcher) AS name
     FROM detentions
     WHERE dispatcher IS NOT NULL AND TRIM(dispatcher) <> ''
     ORDER BY name ASC`
  );
  return uniqueCanonicalDispatchers(
    rows.map((r) => String(r.name || "")).filter(Boolean)
  );
}

export async function getDetentionWeeklySummary(
  limit = 26,
  filters: DetentionSummaryFilters = {}
): Promise<DetentionPeriodSummary[]> {
  const pool = getPool();
  const { whereSql, params } = buildSummaryWhere(filters);
  // Aggregate in app using Tuesday-start fleet weeks (same W## as Gross Profit).
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
       COALESCE(email_date, created_at) AS when_at,
       status,
       COALESCE(amount, 0) AS amount,
       COALESCE(settled_amount, amount, 0) AS settled
     FROM detentions
     WHERE ${whereSql}`,
    params
  );

  type Acc = {
    year: number;
    week: number;
    submitted: number;
    submittedAmount: number;
    paid: number;
    collectedAmount: number;
    open: number;
    openAmount: number;
  };
  const map = new Map<string, Acc>();

  for (const r of rows) {
    const d = new Date(r.when_at);
    if (Number.isNaN(d.getTime())) continue;
    const { year, week } = weekOf(d);
    const key = `${year}-${week}`;
    let acc = map.get(key);
    if (!acc) {
      acc = {
        year,
        week,
        submitted: 0,
        submittedAmount: 0,
        paid: 0,
        collectedAmount: 0,
        open: 0,
        openAmount: 0,
      };
      map.set(key, acc);
    }
    const amt = money(r.amount);
    acc.submitted += 1;
    acc.submittedAmount += amt;
    const status = String(r.status || "");
    if (status === "Paid") {
      acc.paid += 1;
      acc.collectedAmount += money(r.settled);
    } else if (status !== "Denied") {
      acc.open += 1;
      acc.openAmount += amt;
    }
  }

  const nowWeek = weekOf(new Date());
  const currentKey = `${nowWeek.year}-W${nowWeek.week}`;

  return [...map.values()]
    .sort((a, b) => b.year - a.year || b.week - a.week)
    .slice(0, limit)
    .map((a) => {
      const range = weekRange(a.year, a.week);
      const key = `${a.year}-W${a.week}`;
      return {
        key,
        label: `W${a.week}`,
        hint: `${range.start} → ${range.end}`,
        isCurrent: key === currentKey,
        submitted: a.submitted,
        submittedAmount: Math.round(a.submittedAmount * 100) / 100,
        paid: a.paid,
        collectedAmount: Math.round(a.collectedAmount * 100) / 100,
        open: a.open,
        openAmount: Math.round(a.openAmount * 100) / 100,
      };
    });
}

export async function getDetentionMonthlySummary(
  limit = 18,
  filters: DetentionSummaryFilters = {}
): Promise<DetentionPeriodSummary[]> {
  const pool = getPool();
  const { whereSql, params } = buildSummaryWhere(filters);
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
       DATE_FORMAT(${EMAIL_DAY}, '%Y-%m') AS ym,
       COUNT(*) AS submitted,
       COALESCE(SUM(COALESCE(amount, 0)), 0) AS submitted_amount,
       SUM(CASE WHEN status = 'Paid' THEN 1 ELSE 0 END) AS paid_count,
       COALESCE(SUM(CASE WHEN status = 'Paid' THEN COALESCE(settled_amount, amount, 0) ELSE 0 END), 0) AS collected_amount,
       SUM(CASE WHEN status NOT IN ('Paid','Denied') THEN 1 ELSE 0 END) AS open_count,
       COALESCE(SUM(CASE WHEN status NOT IN ('Paid','Denied') THEN COALESCE(amount, 0) ELSE 0 END), 0) AS open_amount
     FROM detentions
     WHERE ${whereSql}
     GROUP BY DATE_FORMAT(${EMAIL_DAY}, '%Y-%m')
     ORDER BY ym DESC
     LIMIT ?`,
    [...params, limit]
  );

  const currentYm = new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.APP_TIMEZONE || "America/Chicago",
    year: "numeric",
    month: "2-digit",
  })
    .format(new Date())
    .slice(0, 7);

  return rows.map((r) => {
    const ym = String(r.ym || "");
    const [y, m] = ym.split("-").map(Number);
    const label =
      y && m
        ? new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          })
        : ym;
    return {
      key: ym,
      label,
      isCurrent: ym === currentYm,
      submitted: Number(r.submitted || 0),
      submittedAmount: money(r.submitted_amount),
      paid: Number(r.paid_count || 0),
      collectedAmount: money(r.collected_amount),
      open: Number(r.open_count || 0),
      openAmount: money(r.open_amount),
    };
  });
}

export async function getDetentionDispatcherSummary(
  filters: DetentionSummaryFilters = {}
): Promise<DetentionDispatcherSummary[]> {
  const pool = getPool();
  const { whereSql, params } = buildSummaryWhere(filters);
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
       COALESCE(NULLIF(TRIM(dispatcher), ''), 'Unassigned') AS dispatcher_name,
       COUNT(*) AS submitted,
       COALESCE(SUM(COALESCE(amount, 0)), 0) AS submitted_amount,
       SUM(CASE WHEN COALESCE(status, '') <> 'Denied' THEN 1 ELSE 0 END) AS approved,
       COALESCE(SUM(CASE WHEN COALESCE(status, '') <> 'Denied' THEN COALESCE(amount, 0) ELSE 0 END), 0) AS approved_amount,
       SUM(CASE WHEN status = 'Paid' THEN 1 ELSE 0 END) AS paid_count,
       COALESCE(SUM(CASE WHEN status = 'Paid' THEN COALESCE(settled_amount, amount, 0) ELSE 0 END), 0) AS collected_amount,
       SUM(CASE WHEN status NOT IN ('Paid','Denied') THEN 1 ELSE 0 END) AS open_count,
       COALESCE(SUM(CASE WHEN status NOT IN ('Paid','Denied') THEN COALESCE(amount, 0) ELSE 0 END), 0) AS open_amount
     FROM detentions
     WHERE ${whereSql}
     GROUP BY COALESCE(NULLIF(TRIM(dispatcher), ''), 'Unassigned')
     ORDER BY collected_amount DESC, submitted_amount DESC, dispatcher_name ASC`,
    params
  );

  // Merge short-name / full-name duplicates (e.g. Andre + Andre Colton)
  const merged = new Map<string, DetentionDispatcherSummary>();
  for (const r of rows) {
    const dispatcher = canonicalDispatcherName(
      String(r.dispatcher_name || "Unassigned")
    );
    const key = dispatcher.toLowerCase();
    const submittedAmount = money(r.submitted_amount);
    const approvedAmount = money(r.approved_amount);
    const collectedAmount = money(r.collected_amount);
    const prev = merged.get(key);
    if (!prev) {
      merged.set(key, {
        dispatcher,
        submitted: Number(r.submitted || 0),
        submittedAmount,
        approved: Number(r.approved || 0),
        approvedAmount,
        paid: Number(r.paid_count || 0),
        collectedAmount,
        open: Number(r.open_count || 0),
        openAmount: money(r.open_amount),
        collectionRate: 0,
      });
    } else {
      prev.submitted += Number(r.submitted || 0);
      prev.submittedAmount += submittedAmount;
      prev.approved += Number(r.approved || 0);
      prev.approvedAmount += approvedAmount;
      prev.paid += Number(r.paid_count || 0);
      prev.collectedAmount += collectedAmount;
      prev.open += Number(r.open_count || 0);
      prev.openAmount += money(r.open_amount);
    }
  }

  return [...merged.values()]
    .map((row) => ({
      ...row,
      collectionRate:
        row.approvedAmount > 0
          ? Math.round((row.collectedAmount / row.approvedAmount) * 1000) / 10
          : 0,
    }))
    .sort(
      (a, b) =>
        b.collectedAmount - a.collectedAmount ||
        b.submittedAmount - a.submittedAmount ||
        a.dispatcher.localeCompare(b.dispatcher)
    );
}

/** Same columns as the old Insights “Customers by detention billed” table. */
export async function getDetentionCustomersBilled(
  filters: DetentionSummaryFilters = {}
): Promise<DetentionPartyRow[]> {
  const pool = getPool();
  const { whereSql, params } = buildSummaryWhere(filters);
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT COALESCE(NULLIF(TRIM(customer), ''), 'Unknown') AS name,
            COUNT(*) AS cnt,
            SUM(COALESCE(detention_mins, 0)) AS mins,
            SUM(COALESCE(amount, 0)) AS billed,
            SUM(CASE WHEN status = 'Paid' THEN COALESCE(settled_amount, amount, 0) ELSE 0 END) AS received
       FROM detentions
      WHERE ${whereSql}
      GROUP BY COALESCE(NULLIF(TRIM(customer), ''), 'Unknown')
      ORDER BY billed DESC`,
    params
  );
  return rows.map((r) => {
    const billed = Math.round(money(r.billed) * 100) / 100;
    const received = Math.round(money(r.received) * 100) / 100;
    return {
      name: String(r.name || "Unknown"),
      detentions: Number(r.cnt || 0),
      hours: Math.round((Number(r.mins || 0) / 60) * 10) / 10,
      billed,
      received,
      rate: billed > 0 ? Math.round((received / billed) * 1000) / 10 : 0,
    };
  });
}

export async function getDetentionComplianceByDispatcher(): Promise<
  DetentionComplianceGroup[]
> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
       id, customer, load_number, shipment_number, driver_name, amount, status,
       email_date, thread_url, dispatcher, dispatcher_email,
       dispatcher_replied_at, dispatcher_compliance
     FROM detentions
     WHERE dispatcher IS NOT NULL AND TRIM(dispatcher) <> ''
     ORDER BY dispatcher ASC, COALESCE(email_date, created_at) DESC`
  );

  // Pass 1: group + collect a known mailbox per dispatcher (from any sibling row).
  type RawRow = {
    r: RowDataPacket;
    dispatcher: string;
    key: string;
  };
  const raws: RawRow[] = [];
  const groupEmail = new Map<string, string>();

  for (const r of rows) {
    const dispatcher = canonicalDispatcherName(String(r.dispatcher).trim());
    const key = dispatcher.toLowerCase();
    raws.push({ r, dispatcher, key });
    const email = String(r.dispatcher_email || "")
      .trim()
      .toLowerCase();
    if (email.includes("@") && !groupEmail.has(key)) {
      groupEmail.set(key, email);
    }
  }

  const groups = new Map<string, DetentionComplianceGroup>();
  const emailBackfill: { id: string; email: string }[] = [];
  const clearNa: { id: string; compliance: string }[] = [];

  for (const { r, dispatcher, key } of raws) {
    if (String(r.status || "") === "Denied") continue;
    if (!groups.has(key)) {
      groups.set(key, {
        dispatcher,
        dispatcherEmail: groupEmail.get(key) || null,
        total: 0,
        ok: 0,
        missed: 0,
        pending: 0,
        noFollowUp: 0,
        na: 0,
        items: [],
      });
    }
    const g = groups.get(key)!;

    const emailDate = r.email_date ? new Date(r.email_date) : null;
    const repliedAt = r.dispatcher_replied_at
      ? new Date(r.dispatcher_replied_at)
      : null;
    const rowEmail = String(r.dispatcher_email || "")
      .trim()
      .toLowerCase();
    const inherited = groupEmail.get(key) || null;
    const dispatcherEmail =
      (rowEmail.includes("@") ? rowEmail : null) || inherited;
    const hadEmailOnRow = rowEmail.includes("@");
    const hasDispatcherEmail = Boolean(dispatcherEmail);

    // Stuck n/a only because email was missing — recompute once we have one.
    const storedRaw = r.dispatcher_compliance
      ? String(r.dispatcher_compliance)
      : null;
    const stored =
      storedRaw === "n/a" && hasDispatcherEmail && !repliedAt
        ? null
        : storedRaw;

    const compliance = resolveDispatcherCompliance({
      status: String(r.status || ""),
      emailDate,
      repliedAt,
      stored,
      hasDispatcherEmail,
    });

    if (!hadEmailOnRow && dispatcherEmail) {
      emailBackfill.push({ id: String(r.id), email: dispatcherEmail });
    }
    if (
      (storedRaw === "n/a" || storedRaw === "no_follow_up") &&
      compliance !== storedRaw
    ) {
      clearNa.push({ id: String(r.id), compliance });
    }

    const item: DetentionComplianceItem = {
      id: String(r.id),
      customer: r.customer ? String(r.customer) : null,
      loadNumber: r.load_number ? String(r.load_number) : null,
      shipmentNumber: r.shipment_number ? String(r.shipment_number) : null,
      driverName: r.driver_name ? String(r.driver_name) : null,
      amount: r.amount == null ? null : Number(r.amount),
      status: String(r.status || ""),
      emailDate: emailDate ? emailDate.toISOString() : null,
      threadUrl: r.thread_url ? String(r.thread_url) : null,
      dispatcher,
      dispatcherEmail,
      dispatcherRepliedAt: repliedAt ? repliedAt.toISOString() : null,
      dispatcherCompliance: compliance,
    };
    g.items.push(item);
    g.total += 1;
    if (compliance === "ok") g.ok += 1;
    else if (compliance === "missed") g.missed += 1;
    else if (compliance === "pending") g.pending += 1;
    else if (compliance === "no_follow_up") g.noFollowUp += 1;
    else g.na += 1;
  }

  // Persist sibling email + clear stuck n/a so the next Gmail scan can score replies.
  if (emailBackfill.length || clearNa.length) {
    try {
      for (const b of emailBackfill) {
        await pool.query(
          `UPDATE detentions
              SET dispatcher_email = COALESCE(dispatcher_email, ?)
            WHERE id = ?`,
          [b.email, b.id]
        );
      }
      for (const c of clearNa) {
        await pool.query(
          `UPDATE detentions
              SET dispatcher_compliance = ?,
                  dispatcher_compliance_checked_at = CURRENT_TIMESTAMP(3)
            WHERE id = ? AND dispatcher_compliance IN ('n/a', 'no_follow_up')`,
          [c.compliance, c.id]
        );
      }
    } catch (err) {
      console.error("[detention-compliance] email backfill failed", err);
    }
  }

  for (const g of groups.values()) {
    g.items.sort((a, b) => {
      const ta = a.emailDate ? new Date(a.emailDate).getTime() : 0;
      const tb = b.emailDate ? new Date(b.emailDate).getTime() : 0;
      return tb - ta;
    });
  }

  return [...groups.values()]
    .filter((g) => g.total > 0)
    .sort((a, b) => a.dispatcher.localeCompare(b.dispatcher));
}

function mondayOfYmd(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  dt.setUTCDate(dt.getUTCDate() + diff);
  return dt.toISOString().slice(0, 10);
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function shortRange(start: string, end: string): string {
  const fmt = (ymd: string) => {
    const [y, m, d] = ymd.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  };
  return `${fmt(start)} – ${fmt(end)}`;
}

/** Monday–Sunday counts of detention emails, answered vs not. */
export async function getDetentionComplianceTrajectory(
  limit = 12
): Promise<DetentionComplianceWeek[]> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
       DATE_FORMAT(DATE(COALESCE(email_date, created_at)), '%Y-%m-%d') AS email_day,
       dispatcher_replied_at
     FROM detentions
     WHERE COALESCE(email_date, created_at) IS NOT NULL
       AND COALESCE(status, '') <> 'Denied'`
  );

  const map = new Map<
    string,
    { received: number; answered: number }
  >();
  for (const r of rows) {
    const day = String(r.email_day || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const start = mondayOfYmd(day);
    let acc = map.get(start);
    if (!acc) {
      acc = { received: 0, answered: 0 };
      map.set(start, acc);
    }
    acc.received += 1;
    if (r.dispatcher_replied_at) acc.answered += 1;
  }

  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, limit)
    .map(([start, acc]) => {
      const end = addDaysYmd(start, 6);
      return {
        key: start,
        label: shortRange(start, end),
        start,
        end,
        received: acc.received,
        answered: acc.answered,
        unanswered: acc.received - acc.answered,
      };
    });
}

/**
 * AR compliance for threads a dispatcher or Art already answered.
 * Missing ar@ mail inside 48h of that answer is no follow-up for AR.
 */
export async function getArComplianceGroup(): Promise<DetentionComplianceGroup> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
       id, customer, load_number, shipment_number, driver_name, amount, status,
       email_date, thread_url, dispatcher, dispatcher_email,
       dispatcher_replied_at, last_reply_from, last_reply_at,
       ar_replied_at, ar_compliance
     FROM detentions
     WHERE dispatcher_replied_at IS NOT NULL
        OR ar_replied_at IS NOT NULL
     ORDER BY COALESCE(email_date, created_at) DESC`
  );

  const group: DetentionComplianceGroup = {
    dispatcher: "Accounts Receivable",
    dispatcherEmail: "ar@goxxii.com",
    total: 0,
    ok: 0,
    missed: 0,
    pending: 0,
    noFollowUp: 0,
    na: 0,
    items: [],
  };

  for (const r of rows) {
    if (String(r.status || "") === "Denied") continue;
    const teamRepliedAt = r.dispatcher_replied_at
      ? new Date(r.dispatcher_replied_at)
      : null;
    let arRepliedAt = r.ar_replied_at ? new Date(r.ar_replied_at) : null;
    if (
      !arRepliedAt &&
      isArMailbox(r.last_reply_from ? String(r.last_reply_from) : null) &&
      r.last_reply_at
    ) {
      arRepliedAt = new Date(r.last_reply_at);
    }
    const compliance = resolveArCompliance({
      status: String(r.status || ""),
      teamRepliedAt,
      arRepliedAt,
    });
    if (compliance === "n/a") continue;

    const item: DetentionComplianceItem = {
      id: String(r.id),
      customer: r.customer ? String(r.customer) : null,
      loadNumber: r.load_number ? String(r.load_number) : null,
      shipmentNumber: r.shipment_number ? String(r.shipment_number) : null,
      driverName: r.driver_name ? String(r.driver_name) : null,
      amount: r.amount == null ? null : Number(r.amount),
      status: String(r.status || ""),
      emailDate: r.email_date ? new Date(r.email_date).toISOString() : null,
      threadUrl: r.thread_url ? String(r.thread_url) : null,
      dispatcher: r.dispatcher ? String(r.dispatcher) : null,
      dispatcherEmail: r.dispatcher_email ? String(r.dispatcher_email) : null,
      dispatcherRepliedAt: teamRepliedAt ? teamRepliedAt.toISOString() : null,
      dispatcherCompliance: compliance,
    };
    group.items.push(item);
    group.total += 1;
    if (compliance === "ok") group.ok += 1;
    else if (compliance === "pending") group.pending += 1;
    else if (compliance === "no_follow_up") group.noFollowUp += 1;
    else if (compliance === "missed") group.missed += 1;
    else group.na += 1;
  }

  return group;
}
