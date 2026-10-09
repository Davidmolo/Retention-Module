import type { RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import { resolveDispatcherCompliance } from "@/lib/detention/compliance";
import { canonicalDispatcherName } from "@/lib/detention/dispatcherNames";
import { weekOf, weekRange } from "@/lib/week";
import type {
  DetentionComplianceGroup,
  DetentionComplianceItem,
  DetentionDispatcherSummary,
  DetentionPeriodSummary,
} from "@/lib/detention/types";

const EMAIL_DAY = "DATE(COALESCE(email_date, created_at))";

function money(n: unknown): number {
  const v = Number(n || 0);
  return Number.isFinite(v) ? v : 0;
}

export async function getDetentionWeeklySummary(
  limit = 26
): Promise<DetentionPeriodSummary[]> {
  const pool = getPool();
  // Aggregate in app using Tuesday-start fleet weeks (same W## as Gross Profit).
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
       COALESCE(email_date, created_at) AS when_at,
       status,
       COALESCE(amount, 0) AS amount,
       COALESCE(settled_amount, amount, 0) AS settled
     FROM detentions
     WHERE COALESCE(email_date, created_at) IS NOT NULL`
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

  return [...map.values()]
    .sort((a, b) => b.year - a.year || b.week - a.week)
    .slice(0, limit)
    .map((a) => {
      const range = weekRange(a.year, a.week);
      return {
        key: `${a.year}-W${a.week}`,
        label: `W${a.week}`,
        hint: `${range.start} → ${range.end}`,
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
  limit = 18
): Promise<DetentionPeriodSummary[]> {
  const pool = getPool();
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
     GROUP BY DATE_FORMAT(${EMAIL_DAY}, '%Y-%m')
     ORDER BY ym DESC
     LIMIT ?`,
    [limit]
  );

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
      submitted: Number(r.submitted || 0),
      submittedAmount: money(r.submitted_amount),
      paid: Number(r.paid_count || 0),
      collectedAmount: money(r.collected_amount),
      open: Number(r.open_count || 0),
      openAmount: money(r.open_amount),
    };
  });
}

export async function getDetentionDispatcherSummary(): Promise<
  DetentionDispatcherSummary[]
> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
       COALESCE(NULLIF(TRIM(dispatcher), ''), 'Unassigned') AS dispatcher_name,
       COUNT(*) AS submitted,
       COALESCE(SUM(COALESCE(amount, 0)), 0) AS submitted_amount,
       SUM(CASE WHEN status = 'Paid' THEN 1 ELSE 0 END) AS paid_count,
       COALESCE(SUM(CASE WHEN status = 'Paid' THEN COALESCE(settled_amount, amount, 0) ELSE 0 END), 0) AS collected_amount,
       SUM(CASE WHEN status NOT IN ('Paid','Denied') THEN 1 ELSE 0 END) AS open_count,
       COALESCE(SUM(CASE WHEN status NOT IN ('Paid','Denied') THEN COALESCE(amount, 0) ELSE 0 END), 0) AS open_amount
     FROM detentions
     GROUP BY COALESCE(NULLIF(TRIM(dispatcher), ''), 'Unassigned')
     ORDER BY collected_amount DESC, submitted_amount DESC, dispatcher_name ASC`
  );

  // Merge short-name / full-name duplicates (e.g. Andre + Andre Colton)
  const merged = new Map<string, DetentionDispatcherSummary>();
  for (const r of rows) {
    const dispatcher = canonicalDispatcherName(
      String(r.dispatcher_name || "Unassigned")
    );
    const key = dispatcher.toLowerCase();
    const submittedAmount = money(r.submitted_amount);
    const collectedAmount = money(r.collected_amount);
    const prev = merged.get(key);
    if (!prev) {
      merged.set(key, {
        dispatcher,
        submitted: Number(r.submitted || 0),
        submittedAmount,
        paid: Number(r.paid_count || 0),
        collectedAmount,
        open: Number(r.open_count || 0),
        openAmount: money(r.open_amount),
        collectionRate: 0,
      });
    } else {
      prev.submitted += Number(r.submitted || 0);
      prev.submittedAmount += submittedAmount;
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
        row.submittedAmount > 0
          ? Math.round((row.collectedAmount / row.submittedAmount) * 1000) / 10
          : 0,
    }))
    .sort(
      (a, b) =>
        b.collectedAmount - a.collectedAmount ||
        b.submittedAmount - a.submittedAmount ||
        a.dispatcher.localeCompare(b.dispatcher)
    );
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

  const groups = new Map<string, DetentionComplianceGroup>();

  for (const r of rows) {
    const rawName = String(r.dispatcher).trim();
    const dispatcher = canonicalDispatcherName(rawName);
    const key = dispatcher.toLowerCase();
    if (!groups.has(key)) {
      groups.set(key, {
        dispatcher,
        dispatcherEmail: r.dispatcher_email
          ? String(r.dispatcher_email)
          : null,
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
    if (!g.dispatcherEmail && r.dispatcher_email) {
      g.dispatcherEmail = String(r.dispatcher_email);
    }

    const emailDate = r.email_date ? new Date(r.email_date) : null;
    const repliedAt = r.dispatcher_replied_at
      ? new Date(r.dispatcher_replied_at)
      : null;
    const compliance = resolveDispatcherCompliance({
      status: String(r.status || ""),
      emailDate,
      repliedAt,
      stored: r.dispatcher_compliance ? String(r.dispatcher_compliance) : null,
    });
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
      dispatcherEmail: r.dispatcher_email
        ? String(r.dispatcher_email)
        : null,
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

  for (const g of groups.values()) {
    g.items.sort((a, b) => {
      const ta = a.emailDate ? new Date(a.emailDate).getTime() : 0;
      const tb = b.emailDate ? new Date(b.emailDate).getTime() : 0;
      return tb - ta;
    });
  }

  return [...groups.values()].sort((a, b) =>
    a.dispatcher.localeCompare(b.dispatcher)
  );
}
