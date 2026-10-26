/**
 * Daily Detention compliance digests (48h / T-2 calendar day).
 *
 * - Each dispatcher: only their loads from the target day (emails + answered /
 *   unanswered / compliance %). Mantas is not copied on these.
 * - Art: rollup overview of every dispatcher’s compliance (dispatchers are not
 *   on To). Mantas stays on this overview.
 * - David: one summary each Monday for the Monday–Sunday week that just ended
 *   (emails, answered, paid, denied, pending, dispatcher compliance, and
 *   Accounts Receivable follow-up on the claims the team already answered).
 * - Art: that same Monday, customers by detention billed for the week.
 * - Accounts Receivable: daily T-2 compliance. A dispatcher or Art reply with
 *   no ar@ email inside 48h is AR no-follow-up, not the dispatcher’s.
 * - Art’s reply on a thread counts as dispatcher compliance (see replyScan).
 */
import type { RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import { sendAppEmail } from "@/lib/mail";
import { isArMailbox, resolveArCompliance } from "@/lib/detention/compliance";
import { canonicalDispatcherName } from "@/lib/detention/dispatcherNames";
import { gmailSearchUrl } from "@/lib/detention/gmailLinks";
import {
  lookupDispatcherEmail,
  runDetentionComplianceScan,
} from "@/lib/detention/replyScan";

function env(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

function parseEmails(raw: string): string[] {
  return raw
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"));
}

function appTimezone(): string {
  return env("APP_TIMEZONE", "America/Chicago");
}

/** Calendar YYYY-MM-DD in app timezone. */
function ymdInTz(date: Date, timeZone = appTimezone()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Shift a YYYY-MM-DD by whole calendar days (UTC date math). */
function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + days));
  return utc.toISOString().slice(0, 10);
}

function ymdFromParts(y: number, month: number, day: number): string {
  return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** MySQL DATE may arrive as a Date; String(date).slice(0,10) is not YYYY-MM-DD. */
function toYmd(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const utcMidnight =
      value.getUTCHours() === 0 &&
      value.getUTCMinutes() === 0 &&
      value.getUTCSeconds() === 0 &&
      value.getUTCMilliseconds() === 0;
    if (utcMidnight) {
      return ymdFromParts(
        value.getUTCFullYear(),
        value.getUTCMonth() + 1,
        value.getUTCDate()
      );
    }
    return ymdFromParts(
      value.getFullYear(),
      value.getMonth() + 1,
      value.getDate()
    );
  }
  const raw = String(value ?? "").trim();
  const iso = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  return "";
}

function formatPrettyDate(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return "";
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  return dt.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function escapeHtml(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type DayDetention = {
  id: string;
  dispatcher: string;
  customer: string;
  loadNumber: string;
  shipmentNumber: string;
  driverName: string;
  amount: number;
  status: string;
  emailDay: string;
  compliance: string | null;
  threadId: string | null;
  threadUrl: string | null;
  repliedAt: Date | null;
  lastReplyFrom: string | null;
  lastReplyAt: Date | null;
  arRepliedAt: Date | null;
};

type DispatcherDayStats = {
  name: string;
  email: string | null;
  total: number;
  answered: number;
  unanswered: number;
  compliancePct: number;
  items: DayDetention[];
  /** Still-open unanswered / no-follow-up from days before the target day. */
  aging: DayDetention[];
};

function mapDetentionRow(r: RowDataPacket): DayDetention {
  const emailDay = toYmd(r.email_day || r.email_date || r.created_at);
  return {
    id: String(r.id),
    dispatcher: canonicalDispatcherName(
      r.dispatcher ? String(r.dispatcher) : null
    ),
    customer: String(r.customer || "Customer"),
    loadNumber: String(r.load_number || "").replace(/^#/, ""),
    shipmentNumber: String(r.shipment_number || "").replace(/^#/, ""),
    driverName: String(r.driver_name || "Driver"),
    amount: Number(r.amount || 0),
    status: String(r.status || ""),
    emailDay,
    compliance: r.dispatcher_compliance
      ? String(r.dispatcher_compliance).toLowerCase()
      : null,
    threadId: r.thread_id ? String(r.thread_id) : null,
    threadUrl: r.thread_url ? String(r.thread_url) : null,
    repliedAt: r.dispatcher_replied_at
      ? new Date(r.dispatcher_replied_at)
      : null,
    lastReplyFrom: r.last_reply_from ? String(r.last_reply_from) : null,
    lastReplyAt: r.last_reply_at ? new Date(r.last_reply_at) : null,
    arRepliedAt: r.ar_replied_at ? new Date(r.ar_replied_at) : null,
  };
}

/** Same AR rule as the compliance board, for one week's detention emails. */
function arPerformance(items: DayDetention[]): {
  onTime: number;
  noFollow: number;
  waiting: number;
  started: number;
  rate: number;
  missed: DayDetention[];
} {
  const missed: DayDetention[] = [];
  let onTime = 0;
  let noFollow = 0;
  let waiting = 0;
  for (const d of items) {
    let arRepliedAt = d.arRepliedAt;
    if (!arRepliedAt && isArMailbox(d.lastReplyFrom) && d.lastReplyAt) {
      arRepliedAt = d.lastReplyAt;
    }
    const compliance = resolveArCompliance({
      status: d.status,
      teamRepliedAt: d.repliedAt,
      arRepliedAt,
    });
    if (compliance === "ok") onTime += 1;
    else if (compliance === "no_follow_up") {
      noFollow += 1;
      missed.push(d);
    } else if (compliance === "pending") waiting += 1;
  }
  const closed = onTime + noFollow;
  return {
    onTime,
    noFollow,
    waiting,
    started: onTime + noFollow + waiting,
    rate: closed ? pct(onTime, closed) : 0,
    missed,
  };
}

/** Search the reader's own Gmail. ar@ thread ids do not open in another mailbox. */
function threadLink(d: DayDetention): string | null {
  return gmailSearchUrl({
    loadNumber: d.loadNumber,
    shipmentNumber: d.shipmentNumber,
  });
}

function isAnswered(d: DayDetention): boolean {
  return Boolean(d.repliedAt);
}

/** Still unanswered by the dispatcher and Art. Follow-up after an answer is AR. */
function isAgingOpen(d: DayDetention): boolean {
  if (d.status === "Paid" || d.status === "Denied") return false;
  return !d.repliedAt;
}

function pct(answered: number, total: number): number {
  if (!total) return 0;
  return Math.round((answered / total) * 1000) / 10;
}

export type ReminderRunResult = {
  ok: boolean;
  targetDate: string;
  dueCount: number;
  dispatcherEmails: number;
  artEmailed: boolean;
  emailed: number;
  mocked: boolean;
  /** Gmail reply scan run for the target day before digests were built. */
  scanChecked?: number;
  scanErrors?: number;
  error?: string;
};

async function loadDetentionsForDay(ymd: string): Promise<DayDetention[]> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, customer, dispatcher, load_number, shipment_number, driver_name,
            amount, status, thread_id, thread_url,
            dispatcher_replied_at, last_reply_from, last_reply_at,
            ar_replied_at, dispatcher_compliance,
            DATE_FORMAT(DATE(COALESCE(email_date, created_at)), '%Y-%m-%d') AS email_day
       FROM detentions
      WHERE DATE(COALESCE(email_date, created_at)) = ?
        AND COALESCE(status, '') <> 'Denied'
      ORDER BY dispatcher ASC, COALESCE(email_date, created_at) ASC`,
    [ymd]
  );
  return rows.map(mapDetentionRow);
}

/**
 * Open detentions from before target day that the dispatcher and Art
 * still have not answered (Mantas: keep listing until status changes).
 */
async function loadDetentionsForRange(
  startYmd: string,
  endYmd: string
): Promise<DayDetention[]> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, customer, dispatcher, load_number, shipment_number, driver_name,
            amount, status, thread_id, thread_url,
            dispatcher_replied_at, last_reply_from, last_reply_at,
            ar_replied_at, dispatcher_compliance,
            DATE_FORMAT(DATE(COALESCE(email_date, created_at)), '%Y-%m-%d') AS email_day
       FROM detentions
      WHERE DATE(COALESCE(email_date, created_at)) BETWEEN ? AND ?
      ORDER BY dispatcher ASC, COALESCE(email_date, created_at) ASC`,
    [startYmd, endYmd]
  );
  return rows.map(mapDetentionRow);
}

function weekdayInTz(date: Date, timeZone = appTimezone()): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
  }).format(date);
}

async function loadAgingUnanswered(beforeYmd: string): Promise<DayDetention[]> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, customer, dispatcher, load_number, shipment_number, driver_name,
            amount, status, thread_id, thread_url,
            dispatcher_replied_at, last_reply_from, last_reply_at,
            ar_replied_at, dispatcher_compliance,
            DATE_FORMAT(DATE(COALESCE(email_date, created_at)), '%Y-%m-%d') AS email_day
       FROM detentions
      WHERE DATE(COALESCE(email_date, created_at)) < ?
        AND status NOT IN ('Paid', 'Denied')
        AND dispatcher_replied_at IS NULL
      ORDER BY COALESCE(email_date, created_at) ASC
      LIMIT 500`,
    [beforeYmd]
  );
  return rows.map(mapDetentionRow).filter(isAgingOpen);
}

async function groupByDispatcher(
  items: DayDetention[],
  aging: DayDetention[]
): Promise<DispatcherDayStats[]> {
  const map = new Map<string, DayDetention[]>();
  for (const item of items) {
    const key = item.dispatcher.toLowerCase();
    const list = map.get(key) || [];
    list.push(item);
    map.set(key, list);
  }
  const agingMap = new Map<string, DayDetention[]>();
  for (const item of aging) {
    const key = item.dispatcher.toLowerCase();
    const list = agingMap.get(key) || [];
    list.push(item);
    agingMap.set(key, list);
  }

  const keys = new Set([...map.keys(), ...agingMap.keys()]);
  const groups: DispatcherDayStats[] = [];
  for (const key of keys) {
    const list = map.get(key) || [];
    const agingList = agingMap.get(key) || [];
    const name =
      list[0]?.dispatcher || agingList[0]?.dispatcher || "Dispatcher";
    const answered = list.filter(isAnswered).length;
    const total = list.length;
    const unanswered = total - answered;
    const email = await lookupDispatcherEmail(name);
    groups.push({
      name,
      email,
      total,
      answered,
      unanswered,
      compliancePct: total ? pct(answered, total) : 0,
      items: list,
      aging: agingList,
    });
  }

  groups.sort((a, b) => a.name.localeCompare(b.name));
  return groups;
}

function itemLinesHtml(
  items: DayDetention[],
  appUrl: string,
  opts?: { showEmailDay?: boolean }
): string {
  return items
    .map((d) => {
      const link = threadLink(d);
      const loadLabel = d.loadNumber || d.shipmentNumber || "—";
      const answered = isAnswered(d);
      const statusBit = answered
        ? `Answered${d.lastReplyFrom ? ` (${escapeHtml(d.lastReplyFrom)})` : ""}`
        : "Unanswered";
      const dayLabel = opts?.showEmailDay ? formatPrettyDate(d.emailDay) : "";
      const dayBit = dayLabel ? ` · ${escapeHtml(dayLabel)}` : "";
      const openLink = link
        ? `<a href="${escapeHtml(link)}" style="color:#0369a1;font-weight:600">Open email</a>`
        : `<a href="${escapeHtml(appUrl)}/detention" style="color:#0369a1">Open board</a>`;
      return `<li style="margin:0 0 10px">
        <div><strong>${escapeHtml(d.customer)}</strong> · Load ${escapeHtml(loadLabel)} · ${escapeHtml(d.driverName)} · $${d.amount.toFixed(2)} · ${escapeHtml(d.status)}${dayBit}</div>
        <div style="color:#64748b;font-size:13px">${statusBit} · ${openLink}</div>
      </li>`;
    })
    .join("");
}

function itemLinesText(
  items: DayDetention[],
  appUrl: string,
  opts?: { showEmailDay?: boolean }
): string[] {
  return items.map((d) => {
    const link = threadLink(d) || `${appUrl}/detention`;
    const loadLabel = d.loadNumber || d.shipmentNumber || "—";
    const answered = isAnswered(d) ? "answered" : "unanswered";
    const dayLabel = opts?.showEmailDay ? formatPrettyDate(d.emailDay) : "";
    const dayBit = dayLabel ? ` · ${dayLabel}` : "";
    return `• ${d.customer} · Load ${loadLabel} · ${d.driverName} · $${d.amount.toFixed(2)} · ${d.status}${dayBit} · ${answered} · ${link}`;
  });
}

function dispatcherDigestBodies(opts: {
  stats: DispatcherDayStats;
  targetDate: string;
  appUrl: string;
}): { subject: string; text: string; html: string } {
  const { stats, targetDate, appUrl } = opts;
  const pretty = formatPrettyDate(targetDate);
  const agingCount = stats.aging.length;
  const subject =
    agingCount > 0
      ? `[XXII Detention] ${stats.name} compliance — ${pretty} (${stats.compliancePct}%) + ${agingCount} aging`
      : `[XXII Detention] ${stats.name} compliance — ${pretty} (${stats.compliancePct}%)`;

  const agingText =
    agingCount > 0
      ? [
          "",
          `Still unanswered from earlier days (${agingCount}):`,
          ...itemLinesText(stats.aging, appUrl, { showEmailDay: true }),
        ]
      : [];

  const text = [
    `Hi ${stats.name},`,
    "",
    `Detention automated-email compliance for ${pretty} (48 hours ago):`,
    "",
    `Total automatic detention emails: ${stats.total}`,
    `Answered: ${stats.answered}`,
    `Unanswered: ${stats.unanswered}`,
    `Compliance: ${stats.compliancePct}%`,
    "",
    ...(stats.items.length
      ? itemLinesText(stats.items, appUrl)
      : ["(No automated detention emails on this day.)"]),
    ...agingText,
    "",
    `Board: ${appUrl}/detention/compliance`,
    "",
    "Art’s reply on a thread counts as answered. If the dispatcher answered and nobody followed up within 48 hours, that miss belongs to Accounts Receivable. Aging unanswered items stay listed until the load status changes in the system.",
  ].join("\n");

  const agingHtml =
    agingCount > 0
      ? `<p style="margin:18px 0 6px;font-weight:700;color:#b91c1c">Still unanswered from earlier days (${agingCount})</p>
      <ul style="padding-left:18px;margin:0">${itemLinesHtml(stats.aging, appUrl, { showEmailDay: true })}</ul>`
      : "";

  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#0f172a;line-height:1.45">
      <p>Hi ${escapeHtml(stats.name)},</p>
      <p>Detention automated-email compliance for <strong>${escapeHtml(pretty)}</strong> (48 hours ago):</p>
      <table style="border-collapse:collapse;margin:12px 0 16px">
        <tr><td style="padding:4px 16px 4px 0;color:#64748b">Total emails</td><td style="padding:4px 0;font-weight:700">${stats.total}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#64748b">Answered</td><td style="padding:4px 0;font-weight:700;color:#047857">${stats.answered}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#64748b">Unanswered</td><td style="padding:4px 0;font-weight:700;color:#b91c1c">${stats.unanswered}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#64748b">Compliance</td><td style="padding:4px 0;font-weight:800;font-size:16px">${stats.compliancePct}%</td></tr>
        ${
          agingCount
            ? `<tr><td style="padding:4px 16px 4px 0;color:#64748b">Aging (prior days)</td><td style="padding:4px 0;font-weight:700;color:#b91c1c">${agingCount}</td></tr>`
            : ""
        }
      </table>
      <p style="margin:0 0 6px;font-weight:700">${escapeHtml(pretty)} loads</p>
      <ul style="padding-left:18px;margin:0">${
        stats.items.length
          ? itemLinesHtml(stats.items, appUrl)
          : "<li style=\"color:#64748b\">No automated detention emails on this day.</li>"
      }</ul>
      ${agingHtml}
      <p style="margin-top:18px"><a href="${escapeHtml(appUrl)}/detention/compliance">Open compliance board</a></p>
      <p style="color:#64748b;font-size:12px">Art’s reply counts as answered. Aging unanswered / no-follow-up items stay listed until the load status changes in the system.</p>
    </div>
  `;
  return { subject, text, html };
}

function artDigestBodies(opts: {
  groups: DispatcherDayStats[];
  targetDate: string;
  appUrl: string;
  fleetTotal: number;
  fleetAnswered: number;
  fleetAging: number;
}): { subject: string; text: string; html: string } {
  const {
    groups,
    targetDate,
    appUrl,
    fleetTotal,
    fleetAnswered,
    fleetAging,
  } = opts;
  const pretty = formatPrettyDate(targetDate);
  const fleetPct = fleetTotal ? pct(fleetAnswered, fleetTotal) : 0;
  const subject =
    fleetAging > 0
      ? `[XXII Detention] Dispatcher compliance rollup — ${pretty} (${fleetPct}%) + ${fleetAging} aging`
      : `[XXII Detention] Dispatcher compliance rollup — ${pretty} (${fleetPct}%)`;

  const textRows = groups.map((g) => {
    const agingBit = g.aging.length ? ` · ${g.aging.length} aging` : "";
    return `• ${g.name}: ${g.total} emails, ${g.answered} answered, ${g.unanswered} not answered — ${g.compliancePct}% compliance${agingBit}`;
  });

  const text = [
    "Hi Art,",
    "",
    `Dispatcher detention-email compliance for ${pretty} (48 hours ago):`,
    "",
    `Fleet: ${fleetTotal} emails · ${fleetAnswered} answered · ${fleetTotal - fleetAnswered} unanswered · ${fleetPct}%` +
      (fleetAging ? ` · ${fleetAging} aging from prior days` : ""),
    "",
    ...textRows,
    "",
    `Board: ${appUrl}/detention/compliance`,
  ].join("\n");

  const tableRows = groups
    .map(
      (g) => `<tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0">${escapeHtml(g.name)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right">${g.total}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;color:#047857">${g.answered}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;color:#b91c1c">${g.unanswered}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;color:#b91c1c">${g.aging.length}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:800">${g.compliancePct}%</td>
      </tr>`
    )
    .join("");

  const detailBlocks = groups
    .map((g) => {
      const agingBlock = g.aging.length
        ? `<p style="margin:10px 0 4px;font-weight:700;color:#b91c1c;font-size:13px">Aging unanswered / no follow-up (${g.aging.length})</p>
        <ul style="padding-left:18px;margin:0">${itemLinesHtml(g.aging, appUrl, { showEmailDay: true })}</ul>`
        : "";
      return `<div style="margin:18px 0 8px">
        <p style="margin:0 0 6px;font-weight:800">${escapeHtml(g.name)} — ${g.compliancePct}% (${escapeHtml(pretty)})</p>
        <ul style="padding-left:18px;margin:0">${
          g.items.length
            ? itemLinesHtml(g.items, appUrl)
            : "<li style=\"color:#64748b\">No emails this day.</li>"
        }</ul>
        ${agingBlock}
      </div>`;
    })
    .join("");

  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#0f172a;line-height:1.45">
      <p>Hi Art,</p>
      <p>Dispatcher detention-email compliance for <strong>${escapeHtml(pretty)}</strong> (48 hours ago).</p>
      <p style="margin:12px 0"><strong>Fleet:</strong> ${fleetTotal} emails · ${fleetAnswered} answered · ${fleetTotal - fleetAnswered} unanswered · <strong>${fleetPct}%</strong>${
        fleetAging
          ? ` · <strong style="color:#b91c1c">${fleetAging} aging</strong> from prior days`
          : ""
      }</p>
      <table style="border-collapse:collapse;width:100%;max-width:720px;margin:12px 0 8px">
        <thead>
          <tr style="background:#f8fafc;text-align:left">
            <th style="padding:8px 10px;border-bottom:2px solid #e2e8f0">Dispatcher</th>
            <th style="padding:8px 10px;border-bottom:2px solid #e2e8f0;text-align:right">Emails</th>
            <th style="padding:8px 10px;border-bottom:2px solid #e2e8f0;text-align:right">Answered</th>
            <th style="padding:8px 10px;border-bottom:2px solid #e2e8f0;text-align:right">Not answered</th>
            <th style="padding:8px 10px;border-bottom:2px solid #e2e8f0;text-align:right">Aging</th>
            <th style="padding:8px 10px;border-bottom:2px solid #e2e8f0;text-align:right">Compliance</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
      ${detailBlocks}
      <p style="margin-top:18px"><a href="${escapeHtml(appUrl)}/detention/compliance">Open compliance board</a></p>
      <p style="color:#64748b;font-size:12px">Aging unanswered items stay listed until the load status changes in the system. A missing follow-up after a dispatcher reply is Accounts Receivable compliance.</p>
    </div>
  `;
  return { subject, text, html };
}

type ArDigestRow = {
  id: string;
  customer: string;
  dispatcher: string;
  loadNumber: string;
  shipmentNumber: string;
  amount: number;
  status: string;
  emailDay: string;
  arCompliance: string;
  threadUrl: string | null;
};

function mapArRow(r: RowDataPacket): ArDigestRow {
  return {
    id: String(r.id),
    customer: String(r.customer || "Customer"),
    dispatcher: canonicalDispatcherName(
      r.dispatcher ? String(r.dispatcher) : null
    ),
    loadNumber: String(r.load_number || "").replace(/^#/, ""),
    shipmentNumber: String(r.shipment_number || "").replace(/^#/, ""),
    amount: Number(r.amount || 0),
    status: String(r.status || ""),
    emailDay: toYmd(r.email_day),
    arCompliance: String(r.ar_compliance || "").toLowerCase(),
    threadUrl: r.thread_url ? String(r.thread_url) : null,
  };
}

async function loadArComplianceRows(opts: {
  day?: string;
  beforeDay?: string;
}): Promise<ArDigestRow[]> {
  const pool = getPool();
  const params: string[] = [];
  let where = `dispatcher_replied_at IS NOT NULL`;
  if (opts.day) {
    where += ` AND DATE(COALESCE(email_date, created_at)) = ?`;
    params.push(opts.day);
  } else if (opts.beforeDay) {
    where += ` AND DATE(COALESCE(email_date, created_at)) < ?
      AND status NOT IN ('Paid','Denied')
      AND LOWER(COALESCE(ar_compliance,'')) = 'no_follow_up'`;
    params.push(opts.beforeDay);
  }
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, customer, dispatcher, load_number, shipment_number, amount, status,
            thread_url, ar_compliance,
            DATE_FORMAT(DATE(COALESCE(email_date, created_at)), '%Y-%m-%d') AS email_day
       FROM detentions
      WHERE ${where}
      ORDER BY COALESCE(email_date, created_at) ASC
      LIMIT 500`,
    params
  );
  return rows.map(mapArRow);
}

function arLine(row: ArDigestRow, appUrl: string): string {
  const load = row.loadNumber || row.shipmentNumber || "—";
  const link = threadLink({
    id: row.id,
    dispatcher: row.dispatcher,
    customer: row.customer,
    loadNumber: row.loadNumber,
    shipmentNumber: row.shipmentNumber,
    driverName: "",
    amount: row.amount,
    status: row.status,
    emailDay: row.emailDay,
    compliance: null,
    threadId: null,
    threadUrl: row.threadUrl,
    repliedAt: null,
    lastReplyFrom: null,
    lastReplyAt: null,
    arRepliedAt: null,
  });
  const label =
    row.arCompliance === "ok"
      ? "AR replied ≤48h"
      : row.arCompliance === "pending"
        ? "Waiting (48h)"
        : "No follow up ≤48h";
  return `• ${row.customer} · ${row.dispatcher} · Load ${load} · $${row.amount.toFixed(2)} · ${row.status} · ${label} · ${link || `${appUrl}/detention/compliance`}`;
}

/** Daily T-2 compliance for ar@ — same 48h window as dispatchers. */
async function sendArComplianceDigest(opts: {
  targetDate: string;
  appUrl: string;
}): Promise<{ ok: boolean; emailed: number; mocked: boolean; error?: string }> {
  const to = parseEmails(env("DETENTION_AR_COMPLIANCE_TO", "ar@goxxii.com"));
  if (!to.length) return { ok: true, emailed: 0, mocked: false };

  const dayRows = await loadArComplianceRows({ day: opts.targetDate });
  const aging = await loadArComplianceRows({ beforeDay: opts.targetDate });
  if (!dayRows.length && !aging.length) {
    return { ok: true, emailed: 0, mocked: false };
  }

  const okCount = dayRows.filter((r) => r.arCompliance === "ok").length;
  const missCount = dayRows.filter((r) => r.arCompliance === "no_follow_up").length;
  const pendingCount = dayRows.filter((r) => r.arCompliance === "pending").length;
  const scored = okCount + missCount + pendingCount;
  const compliancePct = scored ? pct(okCount, scored) : 0;
  const pretty = formatPrettyDate(opts.targetDate);
  const subject = `[XXII Detention] Accounts Receivable compliance — ${pretty} (${compliancePct}%)`;
  const text = [
    "Hi Accounts Receivable,",
    "",
    `Detention follow-up compliance for ${pretty} (48 hours).`,
    "These are threads a dispatcher or Art already answered. If ar@ did not email within 48 hours of that answer, it is an AR no-follow-up. The dispatcher who answered stays compliant.",
    "",
    `Team answered: ${dayRows.length}`,
    `AR replied ≤48h: ${okCount}`,
    `No follow up ≤48h: ${missCount}`,
    `Still inside 48h: ${pendingCount}`,
    `Compliance: ${compliancePct}%`,
    "",
    ...(dayRows.length ? dayRows.map((r) => arLine(r, opts.appUrl)) : ["(No team answers on this day.)"]),
    ...(aging.length
      ? ["", `Still no AR follow-up from earlier days (${aging.length}):`, ...aging.map((r) => arLine(r, opts.appUrl))]
      : []),
    "",
    `Board: ${opts.appUrl}/detention/compliance`,
  ].join("\n");

  const rowHtml = (rows: ArDigestRow[]) =>
    rows
      .map((r) => `<li style="margin:0 0 8px">${escapeHtml(arLine(r, opts.appUrl).replace(/^• /, ""))}</li>`)
      .join("");

  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#0f172a;line-height:1.45">
      <p>Hi Accounts Receivable,</p>
      <p>Detention follow-up compliance for <strong>${escapeHtml(pretty)}</strong> (48 hours).</p>
      <p>These are threads a dispatcher or Art already answered. If ar@ did not email within 48 hours of that answer, it is an AR no-follow-up. The dispatcher who answered stays compliant.</p>
      <table style="border-collapse:collapse;margin:12px 0 16px">
        <tr><td style="padding:4px 16px 4px 0;color:#64748b">Team answered</td><td style="padding:4px 0;font-weight:700">${dayRows.length}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#64748b">AR replied ≤48h</td><td style="padding:4px 0;font-weight:700;color:#047857">${okCount}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#64748b">No follow up ≤48h</td><td style="padding:4px 0;font-weight:700;color:#c2410c">${missCount}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#64748b">Still inside 48h</td><td style="padding:4px 0;font-weight:700">${pendingCount}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#64748b">Compliance</td><td style="padding:4px 0;font-weight:800">${compliancePct}%</td></tr>
      </table>
      ${dayRows.length ? `<ul style="padding-left:18px;margin:0">${rowHtml(dayRows)}</ul>` : `<p>No team answers on this day.</p>`}
      ${aging.length ? `<p style="margin:18px 0 6px;font-weight:700;color:#c2410c">Still no AR follow-up from earlier days (${aging.length})</p><ul style="padding-left:18px;margin:0">${rowHtml(aging)}</ul>` : ""}
      <p style="margin-top:18px"><a href="${escapeHtml(opts.appUrl)}/detention/compliance">Open compliance board</a></p>
    </div>
  `;

  const send = await sendAppEmail({ to, subject, text, html });
  if (!send.ok) {
    return { ok: false, emailed: 0, mocked: false, error: send.error || "AR send failed" };
  }
  return { ok: true, emailed: 1, mocked: Boolean(send.mocked) };
}

/**
 * Mantas: T-2 compliance digests (Thursday run → Tuesday activity).
 * Optional override: DETENTION_REMINDER_TARGET_DATE=YYYY-MM-DD
 *
 * Art’s follow-up digests are separate — see followUpDigests.ts.
 */
export async function runDetentionComplianceDigests(): Promise<ReminderRunResult> {
  const appUrl = env("NEXT_PUBLIC_APP_URL", "https://v2.goxxii.com").replace(
    /\/$/,
    ""
  );
  const overviewCc = parseEmails(
    env("DETENTION_REMINDER_CC", "mantas@goxxii.com")
  );
  const dispatcherCc = overviewCc.filter((e) => e !== "mantas@goxxii.com");
  const artTo = parseEmails(
    env("DETENTION_REMINDER_ART_TO", env("DETENTION_REMINDER_TO", "Art@goxxii.com"))
  );

  const today = ymdInTz(new Date());
  const targetDate =
    env("DETENTION_REMINDER_TARGET_DATE") || addDaysYmd(today, -2);

  // Refresh replies for the target day + aging open unanswered before that day.
  const scanDay = await runDetentionComplianceScan({ emailDay: targetDate });
  const scanAging = await runDetentionComplianceScan({
    agingBeforeDay: targetDate,
  });
  const scanChecked = scanDay.checked + scanAging.checked;
  const scanErrors = scanDay.errors + scanAging.errors;

  const items = await loadDetentionsForDay(targetDate);
  const aging = await loadAgingUnanswered(targetDate);
  const arSend = await sendArComplianceDigest({ targetDate, appUrl });
  if (!items.length && !aging.length) {
    return {
      ok: arSend.ok,
      targetDate,
      dueCount: 0,
      dispatcherEmails: 0,
      artEmailed: false,
      emailed: arSend.emailed,
      mocked: arSend.mocked,
      scanChecked,
      scanErrors,
      error: arSend.error,
    };
  }

  const groups = await groupByDispatcher(items, aging);
  const fleetAnswered = items.filter(isAnswered).length;
  const fleetAging = aging.length;
  let emailed = 0;
  let dispatcherEmails = 0;
  let artEmailed = false;
  let anyMocked = false;
  const errors: string[] = [];

  for (const stats of groups) {
    if (!stats.email) continue;
    if (!stats.items.length && !stats.aging.length) continue;
    const body = dispatcherDigestBodies({ stats, targetDate, appUrl });
    const send = await sendAppEmail({
      to: stats.email,
      cc: dispatcherCc,
      subject: body.subject,
      text: body.text,
      html: body.html,
    });
    if (send.ok) {
      emailed += 1;
      dispatcherEmails += 1;
      if (send.mocked) anyMocked = true;
    } else {
      errors.push(`${stats.name}: ${send.error || "send failed"}`);
    }
  }

  if (artTo.length) {
    const body = artDigestBodies({
      groups,
      targetDate,
      appUrl,
      fleetTotal: items.length,
      fleetAnswered,
      fleetAging,
    });
    const send = await sendAppEmail({
      to: artTo,
      cc: overviewCc,
      subject: body.subject,
      text: body.text,
      html: body.html,
    });
    if (send.ok) {
      emailed += 1;
      artEmailed = true;
      if (send.mocked) anyMocked = true;
    } else {
      errors.push(`Art: ${send.error || "send failed"}`);
    }
  }

  emailed += arSend.emailed;
  if (arSend.mocked) anyMocked = true;
  if (!arSend.ok && arSend.error) errors.push(`AR: ${arSend.error}`);

  if (!emailed && errors.length) {
    return {
      ok: false,
      targetDate,
      dueCount: items.length + aging.length,
      dispatcherEmails: 0,
      artEmailed: false,
      emailed: 0,
      mocked: false,
      scanChecked,
      scanErrors,
      error: errors.join("; "),
    };
  }

  return {
    ok: true,
    targetDate,
    dueCount: items.length + aging.length,
    dispatcherEmails,
    artEmailed,
    emailed,
    mocked: anyMocked,
    scanChecked,
    scanErrors,
    error: errors.length ? errors.join("; ") : undefined,
  };
}

/**
 * David’s weekly summary: Monday–Sunday that just ended.
 * Sent on Monday only, with the 6:00 AM Chicago detention run.
 */
export async function runDetentionWeeklySummary(): Promise<{
  ok: boolean;
  skipped: boolean;
  weekStart: string;
  weekEnd: string;
  emailed: number;
  mocked: boolean;
  error?: string;
}> {
  const today = ymdInTz(new Date());
  const weekEnd = addDaysYmd(today, -1);
  const weekStart = addDaysYmd(today, -7);
  const force = env("DETENTION_WEEKLY_SUMMARY_FORCE") === "1";
  const empty = {
    ok: true,
    skipped: true,
    weekStart,
    weekEnd,
    emailed: 0,
    mocked: false,
  };
  if (!force && weekdayInTz(new Date()) !== "Monday") return empty;

  const to = parseEmails(
    env("DETENTION_WEEKLY_SUMMARY_TO", "david@goxxii.com")
  );
  if (!to.length) {
    return { ...empty, skipped: false, ok: false, error: "No weekly summary recipient" };
  }

  const items = await loadDetentionsForRange(weekStart, weekEnd);
  const approvedItems = items.filter((d) => d.status !== "Denied");
  const groups = (await groupByDispatcher(approvedItems, [])).filter(
    (g) => g.total > 0
  );
  const fleetTotal = approvedItems.length;
  const fleetAnswered = approvedItems.filter(isAnswered).length;
  const fleetPct = fleetTotal ? pct(fleetAnswered, fleetTotal) : 0;
  const paid = items.filter((d) => d.status === "Paid").length;
  const denied = items.filter((d) => d.status === "Denied").length;
  const pending = items.filter(
    (d) => d.status !== "Paid" && d.status !== "Denied"
  ).length;
  const ar = arPerformance(approvedItems);
  const startLabel = formatPrettyDate(weekStart);
  const endLabel = formatPrettyDate(weekEnd);
  const appUrl = env("NEXT_PUBLIC_APP_URL", "https://v2.goxxii.com").replace(
    /\/$/,
    ""
  );

  const subject = `[XXII Detention] Weekly summary — ${startLabel} to ${endLabel} (${fleetPct}%)`;
  const lines = groups.map(
    (g) =>
      `• ${g.name}: ${g.total} emails, ${g.answered} answered, ${g.unanswered} not answered — ${g.compliancePct}%`
  );
  const arSummary = ar.started
    ? `Accounts Receivable: ${ar.started} claims after a dispatcher or Art reply · ${ar.onTime} on time · ${ar.noFollow} no follow-up · ${ar.waiting} still inside 48 hours · ${ar.rate}%`
    : "Accounts Receivable: no claims this week had a dispatcher or Art reply yet, so AR was not scored.";
  const arMissLines = ar.missed.map((d) => {
    const load = d.loadNumber || d.shipmentNumber || "—";
    return `• ${d.customer} · ${d.dispatcher} · Load ${load} · $${d.amount.toFixed(2)} · ${d.status}`;
  });
  const text = [
    "Hi David,",
    "",
    `Detention summary for ${startLabel} through ${endLabel}.`,
    "",
    `Fleet: ${fleetTotal} emails · ${fleetAnswered} answered · ${fleetTotal - fleetAnswered} not answered · ${fleetPct}%`,
    "Compliance counts real detentions only. Denied claims are left out.",
    `Paid: ${paid} · Denied: ${denied} · Pending: ${pending}`,
    "",
    ...(lines.length ? lines : ["No detention emails this week."]),
    "",
    arSummary,
    ...(ar.started
      ? [
          "On time means ar@ emailed within 48 hours of the dispatcher or Art reply, or the claim is already Paid or Denied.",
        ]
      : []),
    ...(arMissLines.length ? ["No follow-up:", ...arMissLines] : []),
    "",
    `Board: ${appUrl}/detention/compliance`,
  ].join("\n");

  const tableRows = groups
    .map(
      (g) => `<tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0">${escapeHtml(g.name)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right">${g.total}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;color:#047857">${g.answered}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;color:#b91c1c">${g.unanswered}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:800">${g.compliancePct}%</td>
      </tr>`
    )
    .join("");

  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#0f172a;line-height:1.45">
      <p>Hi David,</p>
      <p>Detention summary for <strong>${escapeHtml(startLabel)}</strong> through <strong>${escapeHtml(endLabel)}</strong>.</p>
      <p style="margin:12px 0"><strong>Fleet:</strong> ${fleetTotal} emails · ${fleetAnswered} answered · ${fleetTotal - fleetAnswered} not answered · <strong>${fleetPct}%</strong></p>
      <p style="margin:0 0 12px;color:#64748b;font-size:12px">Compliance counts real detentions only. Denied claims are left out.</p>
      <p style="margin:12px 0"><strong>Paid:</strong> ${paid} · <strong>Denied:</strong> ${denied} · <strong>Pending:</strong> ${pending}</p>
      ${
        groups.length
          ? `<table style="border-collapse:collapse;width:100%;max-width:720px;margin:12px 0 8px">
        <thead>
          <tr style="background:#f8fafc;text-align:left">
            <th style="padding:8px 10px;border-bottom:2px solid #e2e8f0">Dispatcher</th>
            <th style="padding:8px 10px;border-bottom:2px solid #e2e8f0;text-align:right">Emails</th>
            <th style="padding:8px 10px;border-bottom:2px solid #e2e8f0;text-align:right">Answered</th>
            <th style="padding:8px 10px;border-bottom:2px solid #e2e8f0;text-align:right">Not answered</th>
            <th style="padding:8px 10px;border-bottom:2px solid #e2e8f0;text-align:right">Compliance</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>`
          : `<p>No detention emails this week.</p>`
      }
      <p style="margin:16px 0 4px"><strong>Accounts Receivable:</strong> ${
        ar.started
          ? `${ar.started} claims after a dispatcher or Art reply · ${ar.onTime} on time · <span style="color:#b91c1c">${ar.noFollow} no follow-up</span> · ${ar.waiting} still inside 48 hours · <strong>${ar.rate}%</strong>`
          : "no claims this week had a dispatcher or Art reply yet, so AR was not scored."
      }</p>
      ${
        ar.started
          ? `<p style="margin:0 0 8px;color:#64748b;font-size:12px">On time means ar@ emailed within 48 hours of the dispatcher or Art reply, or the claim is already Paid or Denied.</p>`
          : ""
      }
      ${
        ar.missed.length
          ? `<p style="margin:8px 0 4px"><strong>No follow-up</strong></p>
        <ul style="margin:0 0 8px;padding-left:18px">
          ${ar.missed
            .map((d) => {
              const load = d.loadNumber || d.shipmentNumber || "—";
              return `<li>${escapeHtml(d.customer)} · ${escapeHtml(d.dispatcher)} · Load ${escapeHtml(load)} · $${d.amount.toFixed(2)} · ${escapeHtml(d.status)}</li>`;
            })
            .join("")}
        </ul>`
          : ""
      }
      <p style="margin-top:18px"><a href="${escapeHtml(appUrl)}/detention/compliance">Open compliance board</a></p>
    </div>
  `;

  const send = await sendAppEmail({ to, subject, text, html });
  if (!send.ok) {
    return {
      ok: false,
      skipped: false,
      weekStart,
      weekEnd,
      emailed: 0,
      mocked: false,
      error: send.error || "send failed",
    };
  }
  return {
    ok: true,
    skipped: false,
    weekStart,
    weekEnd,
    emailed: 1,
    mocked: Boolean(send.mocked),
  };
}

type CustomerBilledRow = {
  name: string;
  detentions: number;
  hours: number;
  billed: number;
  received: number;
  rate: number;
};

/**
 * Monday email to Art: customers by detention billed for the Monday–Sunday
 * week that just ended. Same columns as Summary → Customers by detention billed.
 */
export async function runDetentionCustomerBilledWeekly(): Promise<{
  ok: boolean;
  skipped: boolean;
  weekStart: string;
  weekEnd: string;
  emailed: number;
  mocked: boolean;
  error?: string;
}> {
  const today = ymdInTz(new Date());
  const weekEnd = addDaysYmd(today, -1);
  const weekStart = addDaysYmd(today, -7);
  const force = env("DETENTION_WEEKLY_SUMMARY_FORCE") === "1";
  const empty = {
    ok: true,
    skipped: true,
    weekStart,
    weekEnd,
    emailed: 0,
    mocked: false,
  };
  if (!force && weekdayInTz(new Date()) !== "Monday") return empty;

  const to = parseEmails(
    env("DETENTION_CUSTOMER_BILLED_TO", env("DETENTION_REMINDER_ART_TO", "Art@goxxii.com"))
  );
  if (!to.length) {
    return { ...empty, skipped: false, ok: false, error: "No Art recipient" };
  }

  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT COALESCE(NULLIF(TRIM(customer), ''), 'Unknown') AS name,
            COUNT(*) AS cnt,
            SUM(COALESCE(detention_mins, 0)) AS mins,
            SUM(COALESCE(amount, 0)) AS billed,
            SUM(CASE WHEN status = 'Paid' THEN COALESCE(settled_amount, amount, 0) ELSE 0 END) AS received
       FROM detentions
      WHERE DATE(COALESCE(email_date, created_at)) BETWEEN ? AND ?
      GROUP BY COALESCE(NULLIF(TRIM(customer), ''), 'Unknown')
      ORDER BY billed DESC`,
    [weekStart, weekEnd]
  );
  const customers: CustomerBilledRow[] = rows.map((r) => {
    const billed = Math.round(Number(r.billed || 0) * 100) / 100;
    const received = Math.round(Number(r.received || 0) * 100) / 100;
    return {
      name: String(r.name || "Unknown"),
      detentions: Number(r.cnt || 0),
      hours: Math.round((Number(r.mins || 0) / 60) * 10) / 10,
      billed,
      received,
      rate: billed > 0 ? Math.round((received / billed) * 1000) / 10 : 0,
    };
  });

  const startLabel = formatPrettyDate(weekStart);
  const endLabel = formatPrettyDate(weekEnd);
  const appUrl = env("NEXT_PUBLIC_APP_URL", "https://v2.goxxii.com").replace(/\/$/, "");
  const money = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD" });
  const subject = `[XXII Detention] Customers by detention billed — ${startLabel} to ${endLabel}`;
  const lines = customers.map(
    (c) =>
      `• ${c.name}: ${c.detentions} detentions · ${c.hours} hours · billed ${money(c.billed)} · received ${money(c.received)} · ${c.rate}%`
  );
  const text = [
    "Hi Art,",
    "",
    `Customers by detention billed for ${startLabel} through ${endLabel}.`,
    "",
    ...(lines.length ? lines : ["No detentions billed this week."]),
    "",
    `Board: ${appUrl}/detention`,
  ].join("\n");

  const tableRows = customers
    .map(
      (c) => `<tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0">${escapeHtml(c.name)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right">${c.detentions}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right">${c.hours}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right">${escapeHtml(money(c.billed))}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right">${escapeHtml(money(c.received))}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700">${c.rate}%</td>
      </tr>`
    )
    .join("");
  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#0f172a;line-height:1.45">
      <p>Hi Art,</p>
      <p>Customers by detention billed for <strong>${escapeHtml(startLabel)}</strong> through <strong>${escapeHtml(endLabel)}</strong>.</p>
      ${
        customers.length
          ? `<table style="border-collapse:collapse;width:100%;max-width:760px;margin:12px 0 8px">
        <thead>
          <tr style="background:#f8fafc;text-align:left">
            <th style="padding:8px 10px;border-bottom:2px solid #e2e8f0">Name</th>
            <th style="padding:8px 10px;border-bottom:2px solid #e2e8f0;text-align:right">Detentions</th>
            <th style="padding:8px 10px;border-bottom:2px solid #e2e8f0;text-align:right">Hours</th>
            <th style="padding:8px 10px;border-bottom:2px solid #e2e8f0;text-align:right">Billed</th>
            <th style="padding:8px 10px;border-bottom:2px solid #e2e8f0;text-align:right">Received</th>
            <th style="padding:8px 10px;border-bottom:2px solid #e2e8f0;text-align:right">Rate</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>`
          : `<p>No detentions billed this week.</p>`
      }
      <p style="margin-top:18px"><a href="${escapeHtml(appUrl)}/detention">Open detention board</a></p>
    </div>
  `;

  const send = await sendAppEmail({ to, subject, text, html });
  if (!send.ok) {
    return {
      ok: false,
      skipped: false,
      weekStart,
      weekEnd,
      emailed: 0,
      mocked: false,
      error: send.error || "send failed",
    };
  }
  return {
    ok: true,
    skipped: false,
    weekStart,
    weekEnd,
    emailed: 1,
    mocked: Boolean(send.mocked),
  };
}

/** @deprecated Prefer runDetentionComplianceDigests — kept for existing cron imports. */
export async function runDetentionDailyReminders(): Promise<ReminderRunResult> {
  return runDetentionComplianceDigests();
}
