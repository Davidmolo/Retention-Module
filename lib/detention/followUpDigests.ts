/**
 * Art’s detention follow-up digests (separate from Mantas T-2 compliance digests).
 *
 * 1. One email per dispatcher — only their open (non-Submitted) due loads; CC Art.
 * 2. Thread links for dispatch (no detention board URL).
 * 3. Submitted due items → Accounts Receivable (CC Art).
 * 4. Age label instead of raw timestamps (“30 days, since Sep 14”).
 * 5. Subject + opener + totals + rows grouped by who owes the next move.
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

function escapeHtml(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function moneyExact(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

type FollowUpRow = {
  id: string;
  dispatcher: string;
  customer: string;
  loadNumber: string;
  shipmentNumber: string;
  driverName: string;
  amount: number;
  status: string;
  awaitingUs: boolean;
  /** Dispatcher or Art has replied on the thread. */
  replied: boolean;
  followUpDate: string;
  threadId: string | null;
  threadUrl: string | null;
  ageDays: number;
};

/**
 * Search the reader's own Gmail. ar@ thread IDs do not open in a
 * dispatcher's mailbox, and authuser=ar@ does nothing if they are not signed in.
 */
function threadLink(r: FollowUpRow): string | null {
  const load = r.loadNumber.replace(/^#/, "").trim();
  const ship = r.shipmentNumber.replace(/^#/, "").trim();
  const terms = [...new Set([load, ship].filter(Boolean))];
  if (!terms.length) return null;
  const q =
    terms.length === 1
      ? `Detention ${terms[0]}`
      : `Detention (${terms.join(" OR ")})`;
  return `https://mail.google.com/mail/#search/${encodeURIComponent(q)}`;
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
    // mysql2 DATE is local midnight, not UTC.
    return ymdFromParts(
      value.getFullYear(),
      value.getMonth() + 1,
      value.getDate()
    );
  }
  const raw = String(value ?? "").trim();
  const iso = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, "0");
  const d = String(parsed.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** ALL CAPS roster names → Title Case. Mixed case is left as stored. */
function displayDriverName(raw: string): string {
  const name = String(raw || "").trim();
  if (!name) return "Driver";
  if (name !== name.toUpperCase()) return name;
  return name
    .toLowerCase()
    .replace(/\b([a-z])/g, (ch) => ch.toUpperCase());
}

function parseYmd(value: string | Date): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())
    );
  }
  const raw = String(value || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [y, m, d] = raw.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function todayYmdUtcInTz(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: appTimezone(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function ageDaysSince(ymd: string, todayYmd: string): number {
  const a = parseYmd(ymd);
  const b = parseYmd(todayYmd);
  if (!a || !b) return 0;
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86_400_000));
}

function formatSince(ymd: string): string {
  const d = parseYmd(ymd);
  if (!d) return ymd;
  const weekday = d.toLocaleDateString("en-US", {
    weekday: "short",
    timeZone: "UTC",
  });
  const monthDay = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  return `${weekday} ${monthDay}`;
}

/** Calendar age. Sep 17 → Oct 15 is 28 days. */
export function detentionAgeDays(followUp: unknown, todayYmd: string): number {
  return ageDaysSince(toYmd(followUp), todayYmd);
}

/** “30 days, since Sep 14” */
function ageLabel(r: FollowUpRow): string {
  const unit = r.ageDays === 1 ? "day" : "days";
  return `${r.ageDays} ${unit}, since ${formatSince(r.followUpDate)}`;
}

/** Mockup: red for old, blue for fresher. */
function ageColor(days: number): string {
  if (days >= 21) return "#c2410c";
  if (days >= 14) return "#b45309";
  return "#0369a1";
}

function formatAsOfStamp(): { dateLine: string; asOfLine: string } {
  const now = new Date();
  const dateLine = new Intl.DateTimeFormat("en-US", {
    timeZone: appTimezone(),
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(now);
  const timeLine = new Intl.DateTimeFormat("en-US", {
    timeZone: appTimezone(),
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(now);
  return {
    dateLine,
    asOfLine: `As of ${timeLine} (CT)`,
  };
}

function brandAssetUrl(file: string): string {
  const base = env("NEXT_PUBLIC_APP_URL", "https://v2.goxxii.com").replace(
    /\/$/,
    ""
  );
  return `${base}/brand/${file}`;
}

function brandHeaderHtml(title: string): string {
  const stamp = formatAsOfStamp();
  const hero = env("EMAIL_BRAND_LOGO_URL") || brandAssetUrl("xxii-logo-white.png");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 0;border-collapse:collapse;background:#01052C">
    <tr>
      <td style="padding:28px 48px 4px;text-align:center;background:#01052C">
        <img src="${escapeHtml(hero)}" alt="XXII Century" width="420" style="display:block;width:100%;max-width:420px;height:auto;border:0;margin:0 auto" />
      </td>
    </tr>
    <tr>
      <td style="padding:8px 24px 22px;text-align:center">
        <div style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.02em">${escapeHtml(title)}</div>
        <div style="margin-top:8px;font-size:12px;color:#9fb0c8">${escapeHtml(stamp.dateLine)} · ${escapeHtml(stamp.asOfLine)}</div>
      </td>
    </tr>
    <tr>
      <td style="height:4px;background:#7CC24A;background-image:linear-gradient(90deg,#7CC24A,#2E9CA8,#1D5E8C);font-size:0;line-height:0">&nbsp;</td>
    </tr>
  </table>`;
}

function notesBoxHtml(title: string, bullets: string[]): string {
  const lis = bullets
    .map(
      (b) =>
        `<li style="margin:0 0 6px;color:#334155;font-size:13px;line-height:1.4">${escapeHtml(b)}</li>`
    )
    .join("");
  return `<div style="margin:22px 24px 20px;background:#eff6ff;border:1px solid #dbeafe;border-radius:10px;padding:14px 16px">
    <div style="font-size:13px;font-weight:800;color:#1e3a8a;margin:0 0 8px">${escapeHtml(title)}</div>
    <ul style="margin:0;padding-left:18px">${lis}</ul>
  </div>`;
}

function sortFollowUps(rows: FollowUpRow[]): FollowUpRow[] {
  return [...rows].sort((a, b) => {
    if (a.ageDays !== b.ageDays) return b.ageDays - a.ageDays; // oldest first
    return b.amount - a.amount; // then largest
  });
}

function totals(rows: FollowUpRow[]): {
  count: number;
  value: number;
  oldestDays: number;
} {
  let value = 0;
  let oldestDays = 0;
  for (const r of rows) {
    value += r.amount;
    if (r.ageDays > oldestDays) oldestDays = r.ageDays;
  }
  return { count: rows.length, value, oldestDays };
}

async function loadDueFollowUpIds(): Promise<string[]> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id
       FROM detentions
      WHERE status NOT IN ('Paid', 'Denied')
        AND follow_up_date IS NOT NULL
        AND follow_up_date <= CURDATE()
      ORDER BY follow_up_date ASC
      LIMIT 500`
  );
  return rows.map((r) => String(r.id));
}

async function loadDueFollowUps(): Promise<FollowUpRow[]> {
  const pool = getPool();
  const today = todayYmdUtcInTz();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, customer, dispatcher, load_number, shipment_number, driver_name,
            amount, status, awaiting_us, dispatcher_replied_at,
            follow_up_date, thread_id, thread_url
       FROM detentions
      WHERE status NOT IN ('Paid', 'Denied')
        AND follow_up_date IS NOT NULL
        AND follow_up_date <= CURDATE()
      ORDER BY follow_up_date ASC, amount DESC
      LIMIT 500`
  );

  return rows.map((r) => {
    const followUpDate = toYmd(r.follow_up_date);
    return {
      id: String(r.id),
      dispatcher: canonicalDispatcherName(
        r.dispatcher ? String(r.dispatcher) : null
      ),
      customer: String(r.customer || "Customer"),
      loadNumber: String(r.load_number || "").replace(/^#/, ""),
      shipmentNumber: String(r.shipment_number || "").replace(/^#/, ""),
      driverName: displayDriverName(String(r.driver_name || "Driver")),
      amount: Number(r.amount || 0),
      status: String(r.status || ""),
      awaitingUs: Boolean(r.awaiting_us),
      replied: Boolean(r.dispatcher_replied_at),
      followUpDate,
      threadId: r.thread_id ? String(r.thread_id) : null,
      threadUrl: r.thread_url ? String(r.thread_url) : null,
      ageDays: ageDaysSince(followUpDate, today),
    };
  });
}

/** Art mockup row: broker · load/driver · age · $ · Open thread › */
function rowHtml(r: FollowUpRow, opts?: { showDispatcher?: boolean }): string {
  const link = threadLink(r);
  const load = r.loadNumber || r.shipmentNumber || "—";
  const sub = opts?.showDispatcher
    ? `Load ${load} · ${r.driverName} · ${r.dispatcher}`
    : `Load ${load} · ${r.driverName}`;
  const open = link
    ? `<a href="${escapeHtml(link)}" style="color:#0369a1;font-size:13px;font-weight:700;text-decoration:none;white-space:nowrap">Open thread&nbsp;›</a>`
    : `<span style="color:#94a3b8;font-size:12px">No thread</span>`;
  return `<tr>
    <td style="padding:14px 0;border-bottom:1px solid #e2e8f0;vertical-align:top">
      <div style="font-size:15px;font-weight:800;color:#0f172a">${escapeHtml(r.customer)}</div>
      <div style="font-size:13px;color:#64748b;margin-top:3px">${escapeHtml(sub)}</div>
      <div style="font-size:13px;font-weight:700;color:${ageColor(r.ageDays)};margin-top:6px">${escapeHtml(ageLabel(r))}</div>
    </td>
    <td style="padding:14px 8px;border-bottom:1px solid #e2e8f0;vertical-align:top;text-align:right;white-space:nowrap">
      <div style="font-size:15px;font-weight:800;color:#0f172a">${moneyExact(r.amount)}</div>
      <div style="margin-top:8px">${open}</div>
    </td>
  </tr>`;
}

function rowText(r: FollowUpRow, opts?: { showDispatcher?: boolean }): string {
  const link = threadLink(r) || "(no thread)";
  const load = r.loadNumber || r.shipmentNumber || "—";
  const who = opts?.showDispatcher
    ? `${r.driverName} · ${r.dispatcher}`
    : r.driverName;
  return `• ${r.customer} · Load ${load} · ${who} · ${moneyExact(r.amount)} · ${ageLabel(r)} · ${link}`;
}

/** Soft metric cards from Art’s mockup (OPEN / VALUE / OLDEST). */
function summaryBoxesHtml(opts: {
  leftLabel: string;
  leftValue: string;
  midLabel: string;
  midValue: string;
  rightLabel: string;
  rightValue: string;
}): string {
  const cell = (label: string, value: string) =>
    `<td width="33.33%" style="padding:4px">
      <div style="background:#f5f0e8;border:1px solid #e7e0d4;border-radius:10px;padding:14px 12px;text-align:center">
        <div style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;font-weight:700;color:#78716c">${escapeHtml(label)}</div>
        <div style="font-size:22px;font-weight:800;color:#0f172a;margin-top:6px;letter-spacing:-0.02em">${escapeHtml(value)}</div>
      </div>
    </td>`;
  return `<div style="padding:16px 20px 8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
    <tr>
      ${cell(opts.leftLabel, opts.leftValue)}
      ${cell(opts.midLabel, opts.midValue)}
      ${cell(opts.rightLabel, opts.rightValue)}
    </tr>
  </table></div>`;
}

function groupListHtml(
  title: string,
  rows: FollowUpRow[],
  opts?: { showDispatcher?: boolean }
): string {
  if (!rows.length) return "";
  return `<div style="margin:20px 24px 4px">
    <div style="font-size:15px;font-weight:800;color:#0f172a;margin:0 0 4px">${escapeHtml(title)} (${rows.length})</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
      <tbody>${rows.map((r) => rowHtml(r, opts)).join("")}</tbody>
    </table>
  </div>`;
}

function emailShellHtml(inner: string): string {
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#01052C">
  <div style="font-family:'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;color:#0f172a;line-height:1.45;max-width:640px;margin:0 auto;background:#ffffff">
    ${inner}
    <div style="background:#01052C;padding:22px 24px;text-align:center">
      <div style="height:3px;background:#7CC24A;background-image:linear-gradient(90deg,#7CC24A,#2E9CA8,#1D5E8C);margin:0 auto 14px;max-width:220px"></div>
      <div style="color:#ffffff;font-size:12px;letter-spacing:0.08em;text-transform:uppercase">Where your best, helps others, be better</div>
      <div style="margin-top:8px"><a href="https://goxxii.com" style="color:#7CC24A;font-size:13px;font-weight:700;text-decoration:none">goxxii.com</a></div>
    </div>
  </div>
</body></html>`;
}

export type FollowUpDigestResult = {
  ok: boolean;
  dueCount: number;
  dispatcherEmails: number;
  arEmailed: boolean;
  emailed: number;
  mocked: boolean;
  error?: string;
};

/**
 * Art’s follow-up digests: per-dispatcher open loads + AR submitted list.
 */
export async function runDetentionFollowUpDigests(): Promise<FollowUpDigestResult> {
  const artCc = parseEmails(
    env("DETENTION_FOLLOWUP_CC", env("DETENTION_REMINDER_ART_TO", "art@goxxii.com"))
  );
  const arTo = parseEmails(
    env(
      "DETENTION_FOLLOWUP_AR_TO",
      env("ACCOUNTING_EMAIL", "accounting@goxxii.com")
    )
  );

  const dueIds = await loadDueFollowUpIds();
  if (dueIds.length) {
    // awaiting_us stays on from intake. Refresh Gmail replies so the
    // waiting-on-us / waiting-on-broker split uses dispatcher_replied_at.
    await runDetentionComplianceScan({
      onlyIds: dueIds,
      maxPerRun: dueIds.length,
    });
  }

  const all = await loadDueFollowUps();
  if (!all.length) {
    return {
      ok: true,
      dueCount: 0,
      dispatcherEmails: 0,
      arEmailed: false,
      emailed: 0,
      mocked: false,
    };
  }

  const forDispatchers = all.filter((r) => r.status !== "Submitted");
  const forAr = all.filter((r) => r.status === "Submitted");

  const byDispatcher = new Map<string, FollowUpRow[]>();
  for (const row of forDispatchers) {
    const key = row.dispatcher.toLowerCase();
    const list = byDispatcher.get(key) || [];
    list.push(row);
    byDispatcher.set(key, list);
  }

  let emailed = 0;
  let dispatcherEmails = 0;
  let arEmailed = false;
  let anyMocked = false;
  const errors: string[] = [];

  for (const [, rawRows] of byDispatcher) {
    const rows = sortFollowUps(rawRows);
    const name = rows[0].dispatcher;
    const email = await lookupDispatcherEmail(name);
    if (!email) {
      errors.push(`${name}: no dispatcher email`);
      continue;
    }

    const t = totals(rows);
    // Split on a real reply, not awaiting_us (intake leaves that flag on).
    const waitingUs = sortFollowUps(rows.filter((r) => !r.replied));
    const waitingBroker = sortFollowUps(rows.filter((r) => r.replied));
    const first = name.split(/\s+/)[0] || name;

    const subject = `Detentions: ${t.count} open on your loads, ${money(t.value)} at risk`;
    const opener = `${first}, these ${t.count} detention${t.count === 1 ? "" : "s"} ${t.count === 1 ? "is" : "are"} still open on loads you dispatched.${
      waitingUs.length > 0
        ? ` ${waitingUs.length} of them ${waitingUs.length === 1 ? "is" : "are"} waiting on something from us.`
        : ""
    }`;

    const text = [
      opener,
      "",
      `OPEN: ${t.count}`,
      `VALUE: ${moneyExact(t.value)}`,
      `OLDEST: ${t.oldestDays} day${t.oldestDays === 1 ? "" : "s"}`,
      "",
      waitingUs.length ? `Waiting on us (${waitingUs.length})` : "",
      ...waitingUs.map((r) => rowText(r)),
      waitingUs.length ? "" : "",
      waitingBroker.length ? `Waiting on the broker (${waitingBroker.length})` : "",
      ...waitingBroker.map((r) => rowText(r)),
      "",
      "Open thread searches your own Gmail for this detention so you can reply in place.",
      "Items already submitted for payment are not on this list — those go to Accounts Receivable.",
    ]
      .filter((line, i, arr) => !(line === "" && arr[i - 1] === ""))
      .join("\n");

    const html = emailShellHtml(`
      ${brandHeaderHtml("Detention Follow-Ups")}
      <p style="margin:20px 24px 4px;font-size:15px;color:#0f172a">${escapeHtml(opener)}</p>
      ${summaryBoxesHtml({
        leftLabel: "Open",
        leftValue: String(t.count),
        midLabel: "Value",
        midValue: moneyExact(t.value),
        rightLabel: "Oldest",
        rightValue: `${t.oldestDays} days`,
      })}
      ${groupListHtml("Waiting on us", waitingUs)}
      ${groupListHtml("Waiting on the broker", waitingBroker)}
      ${notesBoxHtml("Quick notes:", [
        "This list shows only loads assigned to you.",
        "Open thread searches your own Gmail for this detention so you can reply in place.",
        "Items already submitted for payment are not on this list — those go to Accounts Receivable.",
      ])}
    `);

    const send = await sendAppEmail({
      to: email,
      cc: artCc,
      subject,
      text,
      html,
    });
    if (send.ok) {
      emailed += 1;
      dispatcherEmails += 1;
      if (send.mocked) anyMocked = true;
    } else {
      errors.push(`${name}: ${send.error || "send failed"}`);
    }
  }

  if (forAr.length && arTo.length) {
    const rows = sortFollowUps(forAr);
    const t = totals(rows);
    const subject = `Detentions: ${t.count} submitted and unpaid, ${money(t.value)} outstanding`;
    const opener = `Paperwork is in on these ${t.count}. They are now a payment question, not a dispatch question.`;

    const text = [
      opener,
      "",
      `SUBMITTED: ${t.count}`,
      `OUTSTANDING: ${moneyExact(t.value)}`,
      `OLDEST: ${t.oldestDays} day${t.oldestDays === 1 ? "" : "s"}`,
      "",
      ...rows.map((r) => rowText(r, { showDispatcher: true })),
      "",
      "Each link searches Gmail for that detention so you can reply in place.",
    ].join("\n");

    const html = emailShellHtml(`
      ${brandHeaderHtml("Detention Follow-Ups")}
      <p style="margin:20px 24px 4px;font-size:15px;color:#0f172a">${escapeHtml(opener)}</p>
      ${summaryBoxesHtml({
        leftLabel: "Submitted",
        leftValue: String(t.count),
        midLabel: "Outstanding",
        midValue: moneyExact(t.value),
        rightLabel: "Oldest",
        rightValue: `${t.oldestDays} days`,
      })}
      ${groupListHtml("No payment confirmation yet", rows, {
        showDispatcher: true,
      })}
      ${notesBoxHtml("Quick notes:", [
        "Dispatcher name is shown so AR knows who to ask if a document is missing.",
        "Anything still missing paperwork stays with the dispatcher and is not on this list.",
        "Each link searches Gmail for that detention so you can reply in place.",
      ])}
    `);

    const send = await sendAppEmail({
      to: arTo,
      cc: artCc,
      subject,
      text,
      html,
    });
    if (send.ok) {
      emailed += 1;
      arEmailed = true;
      if (send.mocked) anyMocked = true;
    } else {
      errors.push(`AR: ${send.error || "send failed"}`);
    }
  }

  if (!emailed && errors.length) {
    return {
      ok: false,
      dueCount: all.length,
      dispatcherEmails: 0,
      arEmailed: false,
      emailed: 0,
      mocked: false,
      error: errors.join("; "),
    };
  }

  return {
    ok: true,
    dueCount: all.length,
    dispatcherEmails,
    arEmailed,
    emailed,
    mocked: anyMocked,
    error: errors.length ? errors.join("; ") : undefined,
  };
}

function sampleRow(
  partial: Partial<FollowUpRow> &
    Pick<FollowUpRow, "customer" | "loadNumber" | "driverName" | "amount" | "ageDays" | "followUpDate" | "awaitingUs">
): FollowUpRow {
  return {
    id: partial.id || "preview",
    dispatcher: partial.dispatcher || "Felix Wagner",
    customer: partial.customer,
    loadNumber: partial.loadNumber,
    shipmentNumber: partial.shipmentNumber || "",
    driverName: displayDriverName(partial.driverName),
    amount: partial.amount,
    status: partial.status || "Docs Pending",
    awaitingUs: partial.awaitingUs,
    replied: partial.replied ?? !partial.awaitingUs,
    followUpDate: partial.followUpDate,
    threadId: partial.threadId || "previewthread",
    threadUrl: partial.threadUrl || null,
    ageDays: detentionAgeDays(partial.followUpDate, todayYmdUtcInTz()),
  };
}

/**
 * Local HTML previews matching Art’s mockups (no DB / no send).
 */
export function buildFollowUpEmailPreviews(): {
  dispatcherSubject: string;
  dispatcherHtml: string;
  arSubject: string;
  arHtml: string;
} {
  const waitingUs = sortFollowUps([
    sampleRow({
      customer: "Redwood Multimodal",
      loadNumber: "2609-00424",
      driverName: "MORTIMER RICHARDS",
      amount: 783.33,
      ageDays: 27,
      followUpDate: "2026-09-17",
      awaitingUs: true,
    }),
    sampleRow({
      customer: "I-55 Logistics",
      loadNumber: "2609-00431",
      driverName: "Amadou Diallo",
      amount: 208.33,
      ageDays: 29,
      followUpDate: "2026-09-15",
      awaitingUs: true,
    }),
    sampleRow({
      customer: "Redwood Multimodal",
      loadNumber: "2609-00416",
      driverName: "Michael Mcginnis",
      amount: 125.0,
      ageDays: 27,
      followUpDate: "2026-09-17",
      awaitingUs: true,
    }),
  ]);
  const waitingBroker = sortFollowUps([
    sampleRow({
      customer: "C.H. Robinson",
      loadNumber: "2609-00382",
      driverName: "Juan Parra Jr.",
      amount: 67.08,
      ageDays: 27,
      followUpDate: "2026-09-17",
      awaitingUs: false,
    }),
    sampleRow({
      customer: "Allen Lund Company",
      loadNumber: "2609-00244",
      driverName: "Donovan Martin",
      amount: 75.0,
      ageDays: 30,
      followUpDate: "2026-09-14",
      awaitingUs: false,
    }),
  ]);
  const openRows = [...waitingUs, ...waitingBroker];
  const t = totals(openRows);
  const opener = `Felix, these ${t.count} detentions are still open on loads you dispatched. ${waitingUs.length} of them are waiting on something from us.`;

  const dispatcherHtml = emailShellHtml(`
    ${brandHeaderHtml("Detention Follow-Ups")}
    <p style="margin:20px 24px 4px;font-size:15px;color:#0f172a">${escapeHtml(opener)}</p>
    ${summaryBoxesHtml({
      leftLabel: "Open",
      leftValue: String(t.count),
      midLabel: "Value",
      midValue: moneyExact(t.value),
      rightLabel: "Oldest",
      rightValue: `${t.oldestDays} days`,
    })}
    ${groupListHtml("Waiting on us", waitingUs)}
    ${groupListHtml("Waiting on the broker", waitingBroker)}
    ${notesBoxHtml("Quick notes:", [
      "This list shows only loads assigned to you.",
      "Open thread searches your own Gmail for this detention so you can reply in place.",
      "Items already submitted for payment are not on this list — those go to Accounts Receivable.",
    ])}
  `);

  const arRows = sortFollowUps([
    sampleRow({
      customer: "C.H. Robinson",
      loadNumber: "2609-00589",
      driverName: "Wayne Rossman",
      dispatcher: "Andre Colton",
      amount: 354.58,
      ageDays: 22,
      followUpDate: "2026-09-22",
      awaitingUs: false,
      status: "Submitted",
    }),
    sampleRow({
      customer: "Spot Freight",
      loadNumber: "2609-00703",
      driverName: "Wayne Rossman",
      dispatcher: "Andre Colton",
      amount: 54.17,
      ageDays: 22,
      followUpDate: "2026-09-22",
      awaitingUs: false,
      status: "Submitted",
    }),
    sampleRow({
      customer: "Avenue logistics",
      loadNumber: "2609-01022",
      driverName: "Mykell Earl",
      dispatcher: "Daisy Dordevic",
      amount: 62.5,
      ageDays: 11,
      followUpDate: "2026-10-03",
      awaitingUs: true,
      status: "Submitted",
    }),
    sampleRow({
      customer: "FitzMark",
      loadNumber: "2610-00149",
      driverName: "Driver",
      dispatcher: "Eric King",
      amount: 315.33,
      ageDays: 4,
      followUpDate: "2026-10-10",
      awaitingUs: true,
      status: "Submitted",
    }),
  ]);
  const at = totals(arRows);
  const arOpener = `Paperwork is in on these ${at.count}. They are now a payment question, not a dispatch question.`;
  const arHtml = emailShellHtml(`
    ${brandHeaderHtml("Detention Follow-Ups")}
    <p style="margin:20px 24px 4px;font-size:15px;color:#0f172a">${escapeHtml(arOpener)}</p>
    ${summaryBoxesHtml({
      leftLabel: "Submitted",
      leftValue: String(at.count),
      midLabel: "Outstanding",
      midValue: moneyExact(at.value),
      rightLabel: "Oldest",
      rightValue: `${at.oldestDays} days`,
    })}
    ${groupListHtml("No payment confirmation yet", arRows, {
      showDispatcher: true,
    })}
    ${notesBoxHtml("Quick notes:", [
      "Dispatcher name is shown so AR knows who to ask if a document is missing.",
      "Anything still missing paperwork stays with the dispatcher and is not on this list.",
      "Each link searches Gmail for that detention so you can reply in place.",
    ])}
  `);

  return {
    dispatcherSubject: `Detentions: ${t.count} open on your loads, ${money(t.value)} at risk`,
    dispatcherHtml,
    arSubject: `Detentions: ${at.count} submitted and unpaid, ${money(at.value)} outstanding`,
    arHtml,
  };
}
