import type { RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import { canonicalDispatcherName } from "@/lib/detention/dispatcherNames";
import type {
  DetentionAgeingBucket,
  DetentionAnalytics,
  DetentionKpis,
  DetentionMonthPoint,
  DetentionPartyRow,
  DetentionStatusBucket,
} from "@/lib/detention/types";

const EMAIL_DAY = "DATE(COALESCE(email_date, created_at))";
const AMT = "COALESCE(amount, 0)";
const RCVD =
  "CASE WHEN status = 'Paid' THEN COALESCE(settled_amount, amount, 0) ELSE 0 END";
const MINS = "COALESCE(detention_mins, 0)";

function money(n: unknown): number {
  const v = Number(n || 0);
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
}

function windowClause(days: number): { sql: string; params: unknown[] } {
  if (!days || days <= 0) return { sql: "1=1", params: [] };
  return {
    sql: `${EMAIL_DAY} >= DATE_SUB(CURDATE(), INTERVAL ? DAY)`,
    params: [days],
  };
}

export async function getDetentionKpisForWindow(
  days = 90
): Promise<DetentionKpis> {
  const pool = getPool();
  const win = windowClause(days);
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN status NOT IN ('Paid','Denied') THEN 1 ELSE 0 END) AS open_count,
       SUM(CASE WHEN awaiting_us = 1 AND status NOT IN ('Paid','Denied') THEN 1 ELSE 0 END) AS awaiting_count,
       SUM(CASE WHEN follow_up_date IS NOT NULL AND follow_up_date <= CURDATE()
                 AND status NOT IN ('Paid','Denied') THEN 1 ELSE 0 END) AS follow_up_count,
       SUM(CASE WHEN status = 'Paid' THEN 1 ELSE 0 END) AS paid_count,
       SUM(CASE WHEN status = 'Denied' THEN 1 ELSE 0 END) AS denied_count,
       SUM(CASE WHEN status = 'New' THEN 1 ELSE 0 END) AS new_count,
       SUM(CASE WHEN status IN ('Pending POD','Docs Pending') THEN 1 ELSE 0 END) AS pending_pod_count,
       SUM(CASE WHEN status IN ('Submitted','Approved') THEN 1 ELSE 0 END) AS submitted_count,
       SUM(CASE WHEN status NOT IN ('Paid','Denied') THEN ${AMT} ELSE 0 END) AS open_amount,
       SUM(CASE WHEN status = 'Paid' THEN COALESCE(settled_amount, amount, 0) ELSE 0 END) AS paid_amount,
       SUM(${AMT}) AS billed_amount,
       SUM(CASE WHEN status NOT IN ('Paid','Denied') THEN ${AMT} ELSE 0 END) AS outstanding_amount,
       SUM(${RCVD}) AS received_amount,
       SUM(CASE WHEN status IN ('Paid','Denied') THEN ${AMT} ELSE 0 END) AS decided_amount,
       SUM(CASE WHEN status = 'Paid' THEN ${AMT} ELSE 0 END) AS paid_billed_amount,
       SUM(${MINS}) AS total_mins
     FROM detentions
     WHERE ${win.sql}`,
    win.params
  );
  const r = rows[0] || {};
  const decided = money(r.decided_amount);
  const paidBilled = money(r.paid_billed_amount);
  const totalMins = Number(r.total_mins || 0);
  const total = Number(r.total || 0);
  return {
    total,
    open: Number(r.open_count || 0),
    awaitingUs: Number(r.awaiting_count || 0),
    followUpDue: Number(r.follow_up_count || 0),
    paid: Number(r.paid_count || 0),
    openAmount: money(r.open_amount),
    paidAmount: money(r.paid_amount),
    billedAmount: money(r.billed_amount),
    billedCount: total,
    outstandingAmount: money(r.outstanding_amount),
    newCount: Number(r.new_count || 0),
    pendingPodCount: Number(r.pending_pod_count || 0),
    submittedCount: Number(r.submitted_count || 0),
    deniedCount: Number(r.denied_count || 0),
    receivedAmount: money(r.received_amount),
    decidedAmount: decided,
    successRate:
      decided > 0 ? Math.round((paidBilled / decided) * 1000) / 10 : 0,
    totalDetentionMins: totalMins,
    avgDetentionMins: total > 0 ? Math.round(totalMins / total) : 0,
  };
}

export async function getDetentionAnalytics(
  days = 90
): Promise<DetentionAnalytics> {
  const pool = getPool();
  const win = windowClause(days);
  const kpis = await getDetentionKpisForWindow(days);

  const [statusRows] = await pool.query<RowDataPacket[]>(
    `SELECT status,
            COUNT(*) AS cnt,
            SUM(${AMT}) AS amt
       FROM detentions
      WHERE ${win.sql}
      GROUP BY status`,
    win.params
  );

  const amountByStatus = new Map<string, { count: number; amount: number }>();
  for (const r of statusRows) {
    amountByStatus.set(String(r.status), {
      count: Number(r.cnt || 0),
      amount: money(r.amt),
    });
  }

  const progressive: DetentionStatusBucket[] = [
    {
      key: "all",
      label: "ALL",
      count: kpis.billedCount,
      amount: kpis.billedAmount,
    },
    {
      key: "new",
      label: "NEW",
      count: amountByStatus.get("New")?.count || 0,
      amount: amountByStatus.get("New")?.amount || 0,
    },
    {
      key: "pending",
      label: "PENDING",
      count:
        (amountByStatus.get("Pending POD")?.count || 0) +
        (amountByStatus.get("Docs Pending")?.count || 0),
      amount:
        (amountByStatus.get("Pending POD")?.amount || 0) +
        (amountByStatus.get("Docs Pending")?.amount || 0),
    },
    {
      key: "submitted",
      label: "SUBMITTED",
      count:
        (amountByStatus.get("Submitted")?.count || 0) +
        (amountByStatus.get("Approved")?.count || 0),
      amount:
        (amountByStatus.get("Submitted")?.amount || 0) +
        (amountByStatus.get("Approved")?.amount || 0),
    },
    {
      key: "paid",
      label: "PAID",
      count: amountByStatus.get("Paid")?.count || 0,
      amount: amountByStatus.get("Paid")?.amount || 0,
    },
    {
      key: "denied",
      label: "DENIED",
      count: amountByStatus.get("Denied")?.count || 0,
      amount: amountByStatus.get("Denied")?.amount || 0,
    },
  ];

  const byStatus: DetentionStatusBucket[] = [
    {
      key: "New",
      label: "New",
      count: amountByStatus.get("New")?.count || 0,
      amount: amountByStatus.get("New")?.amount || 0,
    },
    {
      key: "Pending POD",
      label: "Pending POD",
      count: amountByStatus.get("Pending POD")?.count || 0,
      amount: amountByStatus.get("Pending POD")?.amount || 0,
    },
    {
      key: "Submitted",
      label: "POD Submitted",
      count:
        (amountByStatus.get("Submitted")?.count || 0) +
        (amountByStatus.get("Approved")?.count || 0),
      amount:
        (amountByStatus.get("Submitted")?.amount || 0) +
        (amountByStatus.get("Approved")?.amount || 0),
    },
    {
      key: "Paid",
      label: "Paid",
      count: amountByStatus.get("Paid")?.count || 0,
      amount: amountByStatus.get("Paid")?.amount || 0,
    },
    {
      key: "Denied",
      label: "Denied",
      count: amountByStatus.get("Denied")?.count || 0,
      amount: amountByStatus.get("Denied")?.amount || 0,
    },
  ];

  const [ageRows] = await pool.query<RowDataPacket[]>(
    `SELECT
       SUM(CASE WHEN DATEDIFF(CURDATE(), ${EMAIL_DAY}) BETWEEN 0 AND 7 THEN 1 ELSE 0 END) AS c0,
       SUM(CASE WHEN DATEDIFF(CURDATE(), ${EMAIL_DAY}) BETWEEN 0 AND 7 THEN ${AMT} ELSE 0 END) AS a0,
       SUM(CASE WHEN DATEDIFF(CURDATE(), ${EMAIL_DAY}) BETWEEN 8 AND 14 THEN 1 ELSE 0 END) AS c1,
       SUM(CASE WHEN DATEDIFF(CURDATE(), ${EMAIL_DAY}) BETWEEN 8 AND 14 THEN ${AMT} ELSE 0 END) AS a1,
       SUM(CASE WHEN DATEDIFF(CURDATE(), ${EMAIL_DAY}) BETWEEN 15 AND 30 THEN 1 ELSE 0 END) AS c2,
       SUM(CASE WHEN DATEDIFF(CURDATE(), ${EMAIL_DAY}) BETWEEN 15 AND 30 THEN ${AMT} ELSE 0 END) AS a2,
       SUM(CASE WHEN DATEDIFF(CURDATE(), ${EMAIL_DAY}) BETWEEN 31 AND 60 THEN 1 ELSE 0 END) AS c3,
       SUM(CASE WHEN DATEDIFF(CURDATE(), ${EMAIL_DAY}) BETWEEN 31 AND 60 THEN ${AMT} ELSE 0 END) AS a3,
       SUM(CASE WHEN DATEDIFF(CURDATE(), ${EMAIL_DAY}) > 60 THEN 1 ELSE 0 END) AS c4,
       SUM(CASE WHEN DATEDIFF(CURDATE(), ${EMAIL_DAY}) > 60 THEN ${AMT} ELSE 0 END) AS a4
     FROM detentions
     WHERE status NOT IN ('Paid','Denied') AND ${win.sql}`,
    win.params
  );
  const ar = ageRows[0] || {};
  const ageing: DetentionAgeingBucket[] = [
    {
      key: "0-7",
      label: "0-7 days",
      count: Number(ar.c0 || 0),
      amount: money(ar.a0),
    },
    {
      key: "8-14",
      label: "8-14 days",
      count: Number(ar.c1 || 0),
      amount: money(ar.a1),
    },
    {
      key: "15-30",
      label: "15-30 days",
      count: Number(ar.c2 || 0),
      amount: money(ar.a2),
    },
    {
      key: "31-60",
      label: "31-60 days",
      count: Number(ar.c3 || 0),
      amount: money(ar.a3),
    },
    {
      key: "60+",
      label: "60+ days",
      count: Number(ar.c4 || 0),
      amount: money(ar.a4),
    },
  ];

  const [monthRows] = await pool.query<RowDataPacket[]>(
    `SELECT DATE_FORMAT(${EMAIL_DAY}, '%Y-%m') AS ym,
            SUM(${AMT}) AS billed,
            SUM(${RCVD}) AS received
       FROM detentions
      WHERE ${EMAIL_DAY} >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
      GROUP BY DATE_FORMAT(${EMAIL_DAY}, '%Y-%m')
      ORDER BY ym ASC`
  );
  const byMonth: DetentionMonthPoint[] = monthRows.map((r) => {
    const ym = String(r.ym || "");
    const [y, m] = ym.split("-").map(Number);
    const label =
      y && m
        ? new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", {
            month: "short",
            year: "2-digit",
            timeZone: "UTC",
          })
        : ym;
    return {
      key: ym,
      label,
      billed: money(r.billed),
      received: money(r.received),
    };
  });

  const [custRows] = await pool.query<RowDataPacket[]>(
    `SELECT COALESCE(NULLIF(TRIM(customer), ''), 'Unknown') AS name,
            COUNT(*) AS cnt,
            SUM(${MINS}) AS mins,
            SUM(${AMT}) AS billed,
            SUM(${RCVD}) AS received
       FROM detentions
      WHERE ${win.sql}
      GROUP BY COALESCE(NULLIF(TRIM(customer), ''), 'Unknown')
      ORDER BY billed DESC
      LIMIT 25`,
    win.params
  );

  const [dispRows] = await pool.query<RowDataPacket[]>(
    `SELECT COALESCE(NULLIF(TRIM(dispatcher), ''), 'Unassigned') AS name,
            COUNT(*) AS cnt,
            SUM(${MINS}) AS mins,
            SUM(${AMT}) AS billed,
            SUM(${RCVD}) AS received
       FROM detentions
      WHERE ${win.sql}
      GROUP BY COALESCE(NULLIF(TRIM(dispatcher), ''), 'Unassigned')
      ORDER BY billed DESC`,
    win.params
  );

  function toParty(rows: RowDataPacket[], mergeDispatchers: boolean): DetentionPartyRow[] {
    const map = new Map<string, DetentionPartyRow>();
    for (const r of rows) {
      const raw = String(r.name || "Unknown");
      const name = mergeDispatchers ? canonicalDispatcherName(raw) : raw;
      const key = name.toLowerCase();
      const billed = money(r.billed);
      const received = money(r.received);
      const prev = map.get(key);
      if (!prev) {
        map.set(key, {
          name,
          detentions: Number(r.cnt || 0),
          hours: Math.round((Number(r.mins || 0) / 60) * 10) / 10,
          billed,
          received,
          rate: billed > 0 ? Math.round((received / billed) * 1000) / 10 : 0,
        });
      } else {
        prev.detentions += Number(r.cnt || 0);
        prev.hours =
          Math.round((prev.hours + Number(r.mins || 0) / 60) * 10) / 10;
        prev.billed += billed;
        prev.received += received;
        prev.rate =
          prev.billed > 0
            ? Math.round((prev.received / prev.billed) * 1000) / 10
            : 0;
      }
    }
    return [...map.values()].sort((a, b) => b.billed - a.billed);
  }

  return {
    days,
    kpis,
    progressive,
    ageing,
    byStatus,
    byMonth,
    byCustomer: toParty(custRows, false),
    byDispatcher: toParty(dispRows, true),
  };
}

