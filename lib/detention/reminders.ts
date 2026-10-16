/**
 * Daily Detention compliance digests (48h / T-2 calendar day).
 *
 * - Each dispatcher: only their loads from the target day (emails + answered /
 *   unanswered / compliance %). CC Mantas.
 * - Art: rollup of every dispatcher’s compliance (dispatchers are not on To).
 * - Art’s reply on a thread counts as answered (see replyScan).
 */
import type { RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import { sendAppEmail } from "@/lib/mail";
import { canonicalDispatcherName } from "@/lib/detention/dispatcherNames";
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

function formatPrettyDate(ymd: string): string {
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
  const emailDay = String(r.email_day || r.email_date || r.created_at || "")
    .slice(0, 10);
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
  };
}

/** Search the reader's own Gmail. ar@ thread ids do not open in another mailbox. */
function threadLink(d: DayDetention): string | null {
  const load = String(d.loadNumber || "").replace(/^#/, "").trim();
  const ship = String(d.shipmentNumber || "").replace(/^#/, "").trim();
  const terms = [...new Set([load, ship].filter(Boolean))];
  if (!terms.length) return null;
  const q =
    terms.length === 1
      ? `Detention ${terms[0]}`
      : `Detention (${terms.join(" OR ")})`;
  return `https://mail.google.com/mail/#search/${encodeURIComponent(q)}`;
}

function isAnswered(d: DayDetention): boolean {
  return Boolean(d.repliedAt);
}

/** Still needs attention: never answered, or no follow-up while open. */
function isAgingOpen(d: DayDetention): boolean {
  if (d.status === "Paid" || d.status === "Denied") return false;
  if (!d.repliedAt) return true;
  return (
    d.compliance === "missed" ||
    d.compliance === "no_follow_up" ||
    d.compliance === "pending"
  );
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
            dispatcher_replied_at, last_reply_from, dispatcher_compliance,
            DATE(COALESCE(email_date, created_at)) AS email_day
       FROM detentions
      WHERE DATE(COALESCE(email_date, created_at)) = ?
      ORDER BY dispatcher ASC, COALESCE(email_date, created_at) ASC`,
    [ymd]
  );
  return rows.map(mapDetentionRow);
}

/**
 * Open detentions from before target day that are still unanswered or
 * not followed up (Mantas: keep listing until status changes).
 */
async function loadAgingUnanswered(beforeYmd: string): Promise<DayDetention[]> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, customer, dispatcher, load_number, shipment_number, driver_name,
            amount, status, thread_id, thread_url,
            dispatcher_replied_at, last_reply_from, dispatcher_compliance,
            DATE(COALESCE(email_date, created_at)) AS email_day
       FROM detentions
      WHERE DATE(COALESCE(email_date, created_at)) < ?
        AND status NOT IN ('Paid', 'Denied')
        AND (
          dispatcher_replied_at IS NULL
          OR LOWER(COALESCE(dispatcher_compliance, '')) IN ('missed', 'no_follow_up', 'pending')
        )
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
      const statusBit = !answered
        ? "Unanswered"
        : d.compliance === "no_follow_up"
          ? "No follow-up"
          : `Answered${d.lastReplyFrom ? ` (${escapeHtml(d.lastReplyFrom)})` : ""}`;
      const dayBit = opts?.showEmailDay
        ? ` · ${escapeHtml(formatPrettyDate(d.emailDay))}`
        : "";
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
    const answered = !isAnswered(d)
      ? "unanswered"
      : d.compliance === "no_follow_up"
        ? "no follow-up"
        : "answered";
    const dayBit = opts?.showEmailDay ? ` · ${d.emailDay}` : "";
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
          `Still unanswered / not followed up from earlier days (${agingCount}):`,
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
    "Art’s reply on a thread counts as answered. Aging items stay listed until the load status changes in the system.",
  ].join("\n");

  const agingHtml =
    agingCount > 0
      ? `<p style="margin:18px 0 6px;font-weight:700;color:#b91c1c">Still unanswered / not followed up from earlier days (${agingCount})</p>
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
      <p style="color:#64748b;font-size:12px">Aging unanswered / no-follow-up items stay listed until the load status changes in the system.</p>
    </div>
  `;
  return { subject, text, html };
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
  const cc = parseEmails(env("DETENTION_REMINDER_CC", "mantas@goxxii.com"));
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
  if (!items.length && !aging.length) {
    return {
      ok: true,
      targetDate,
      dueCount: 0,
      dispatcherEmails: 0,
      artEmailed: false,
      emailed: 0,
      mocked: false,
      scanChecked,
      scanErrors,
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
      cc,
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
      cc,
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

/** @deprecated Prefer runDetentionComplianceDigests — kept for existing cron imports. */
export async function runDetentionDailyReminders(): Promise<ReminderRunResult> {
  return runDetentionComplianceDigests();
}
