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
import {
  buildGmailThreadUrl,
  gmailSearchUrl,
  normalizeGmailThreadUrl,
} from "@/lib/detention/gmailLinks";
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
};

function threadLink(d: DayDetention): string | null {
  return (
    normalizeGmailThreadUrl(d.threadUrl) ||
    (d.threadId ? buildGmailThreadUrl(d.threadId) : null) ||
    gmailSearchUrl({
      loadNumber: d.loadNumber || null,
      shipmentNumber: d.shipmentNumber || null,
    })
  );
}

function isAnswered(d: DayDetention): boolean {
  return Boolean(d.repliedAt);
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
            dispatcher_replied_at, last_reply_from
       FROM detentions
      WHERE DATE(COALESCE(email_date, created_at)) = ?
      ORDER BY dispatcher ASC, COALESCE(email_date, created_at) ASC`,
    [ymd]
  );

  return rows.map((r) => ({
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
    threadId: r.thread_id ? String(r.thread_id) : null,
    threadUrl: r.thread_url ? String(r.thread_url) : null,
    repliedAt: r.dispatcher_replied_at
      ? new Date(r.dispatcher_replied_at)
      : null,
    lastReplyFrom: r.last_reply_from ? String(r.last_reply_from) : null,
  }));
}

async function groupByDispatcher(
  items: DayDetention[]
): Promise<DispatcherDayStats[]> {
  const map = new Map<string, DayDetention[]>();
  for (const item of items) {
    const key = item.dispatcher.toLowerCase();
    const list = map.get(key) || [];
    list.push(item);
    map.set(key, list);
  }

  const groups: DispatcherDayStats[] = [];
  for (const [, list] of map) {
    const name = list[0].dispatcher;
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
      compliancePct: pct(answered, total),
      items: list,
    });
  }

  groups.sort((a, b) => a.name.localeCompare(b.name));
  return groups;
}

function itemLinesHtml(items: DayDetention[], appUrl: string): string {
  return items
    .map((d) => {
      const link = threadLink(d);
      const loadLabel = d.loadNumber || d.shipmentNumber || "—";
      const answered = isAnswered(d);
      const statusBit = answered
        ? `Answered${d.lastReplyFrom ? ` (${escapeHtml(d.lastReplyFrom)})` : ""}`
        : "Unanswered";
      const openLink = link
        ? `<a href="${escapeHtml(link)}" style="color:#0369a1;font-weight:600">Open email</a>`
        : `<a href="${escapeHtml(appUrl)}/detention" style="color:#0369a1">Open board</a>`;
      return `<li style="margin:0 0 10px">
        <div><strong>${escapeHtml(d.customer)}</strong> · Load ${escapeHtml(loadLabel)} · ${escapeHtml(d.driverName)} · $${d.amount.toFixed(2)} · ${escapeHtml(d.status)}</div>
        <div style="color:#64748b;font-size:13px">${statusBit} · ${openLink}</div>
      </li>`;
    })
    .join("");
}

function itemLinesText(items: DayDetention[], appUrl: string): string[] {
  return items.map((d) => {
    const link = threadLink(d) || `${appUrl}/detention`;
    const loadLabel = d.loadNumber || d.shipmentNumber || "—";
    const answered = isAnswered(d) ? "answered" : "unanswered";
    return `• ${d.customer} · Load ${loadLabel} · ${d.driverName} · $${d.amount.toFixed(2)} · ${d.status} · ${answered} · ${link}`;
  });
}

function dispatcherDigestBodies(opts: {
  stats: DispatcherDayStats;
  targetDate: string;
  appUrl: string;
}): { subject: string; text: string; html: string } {
  const { stats, targetDate, appUrl } = opts;
  const pretty = formatPrettyDate(targetDate);
  const subject = `[XXII Detention] ${stats.name} compliance — ${pretty} (${stats.compliancePct}%)`;
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
    ...itemLinesText(stats.items, appUrl),
    "",
    `Board: ${appUrl}/detention/compliance`,
    "",
    "Art’s reply on a thread counts as answered. If the load status has not changed, follow up again after 48 hours from the last answer.",
  ].join("\n");

  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#0f172a;line-height:1.45">
      <p>Hi ${escapeHtml(stats.name)},</p>
      <p>Detention automated-email compliance for <strong>${escapeHtml(pretty)}</strong> (48 hours ago):</p>
      <table style="border-collapse:collapse;margin:12px 0 16px">
        <tr><td style="padding:4px 16px 4px 0;color:#64748b">Total emails</td><td style="padding:4px 0;font-weight:700">${stats.total}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#64748b">Answered</td><td style="padding:4px 0;font-weight:700;color:#047857">${stats.answered}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#64748b">Unanswered</td><td style="padding:4px 0;font-weight:700;color:#b91c1c">${stats.unanswered}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#64748b">Compliance</td><td style="padding:4px 0;font-weight:800;font-size:16px">${stats.compliancePct}%</td></tr>
      </table>
      <p style="margin:0 0 6px;font-weight:700">Your loads</p>
      <ul style="padding-left:18px;margin:0">${itemLinesHtml(stats.items, appUrl)}</ul>
      <p style="margin-top:18px"><a href="${escapeHtml(appUrl)}/detention/compliance">Open compliance board</a></p>
      <p style="color:#64748b;font-size:12px">Art’s reply counts as answered. If load status has not changed, keep the 48h follow-up from the last answer.</p>
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
}): { subject: string; text: string; html: string } {
  const { groups, targetDate, appUrl, fleetTotal, fleetAnswered } = opts;
  const pretty = formatPrettyDate(targetDate);
  const fleetPct = pct(fleetAnswered, fleetTotal);
  const subject = `[XXII Detention] Dispatcher compliance rollup — ${pretty} (${fleetPct}%)`;

  const textRows = groups.map(
    (g) =>
      `• ${g.name}: ${g.total} emails, ${g.answered} answered, ${g.unanswered} not answered — ${g.compliancePct}% compliance`
  );

  const text = [
    "Hi Art,",
    "",
    `Dispatcher detention-email compliance for ${pretty} (48 hours ago):`,
    "",
    `Fleet: ${fleetTotal} emails · ${fleetAnswered} answered · ${fleetTotal - fleetAnswered} unanswered · ${fleetPct}%`,
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
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:800">${g.compliancePct}%</td>
      </tr>`
    )
    .join("");

  const detailBlocks = groups
    .map(
      (g) => `<div style="margin:18px 0 8px">
        <p style="margin:0 0 6px;font-weight:800">${escapeHtml(g.name)} — ${g.compliancePct}%</p>
        <ul style="padding-left:18px;margin:0">${itemLinesHtml(g.items, appUrl)}</ul>
      </div>`
    )
    .join("");

  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#0f172a;line-height:1.45">
      <p>Hi Art,</p>
      <p>Dispatcher detention-email compliance for <strong>${escapeHtml(pretty)}</strong> (48 hours ago).</p>
      <p style="margin:12px 0"><strong>Fleet:</strong> ${fleetTotal} emails · ${fleetAnswered} answered · ${fleetTotal - fleetAnswered} unanswered · <strong>${fleetPct}%</strong></p>
      <table style="border-collapse:collapse;width:100%;max-width:640px;margin:12px 0 8px">
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
      </table>
      ${detailBlocks}
      <p style="margin-top:18px"><a href="${escapeHtml(appUrl)}/detention/compliance">Open compliance board</a></p>
      <p style="color:#64748b;font-size:12px">Your reply on a thread counts as answered for that dispatcher. If load status has not changed, follow up again after 48 hours from the last answer.</p>
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

  // Refresh Art/dispatcher replies from Gmail for that day before building digests.
  const scan = await runDetentionComplianceScan({ emailDay: targetDate });

  const items = await loadDetentionsForDay(targetDate);
  if (!items.length) {
    return {
      ok: true,
      targetDate,
      dueCount: 0,
      dispatcherEmails: 0,
      artEmailed: false,
      emailed: 0,
      mocked: false,
      scanChecked: scan.checked,
      scanErrors: scan.errors,
    };
  }

  const groups = await groupByDispatcher(items);
  const fleetAnswered = items.filter(isAnswered).length;
  let emailed = 0;
  let dispatcherEmails = 0;
  let artEmailed = false;
  let anyMocked = false;
  const errors: string[] = [];

  for (const stats of groups) {
    if (!stats.email) continue;
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
      dueCount: items.length,
      dispatcherEmails: 0,
      artEmailed: false,
      emailed: 0,
      mocked: false,
      scanChecked: scan.checked,
      scanErrors: scan.errors,
      error: errors.join("; "),
    };
  }

  return {
    ok: true,
    targetDate,
    dueCount: items.length,
    dispatcherEmails,
    artEmailed,
    emailed,
    mocked: anyMocked,
    scanChecked: scan.checked,
    scanErrors: scan.errors,
    error: errors.length ? errors.join("; ") : undefined,
  };
}

/** @deprecated Prefer runDetentionComplianceDigests — kept for existing cron imports. */
export async function runDetentionDailyReminders(): Promise<ReminderRunResult> {
  return runDetentionComplianceDigests();
}
