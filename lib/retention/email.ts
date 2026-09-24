/**
 * Retention outbound email (XXII Century).
 * From: notifications@goxxii.com / "XXII Century Notifications" (per Nadia).
 * James (JAMES_EMAIL) is always included on at-risk + birthday leadership notices.
 *
 * Needs SMTP_* env. Without SMTP → logs mock and still writes notification_logs.
 *
 * RETENTION_EMAIL_TESTING=true → all retention mail goes to RETENTION_EMAIL_TEST_TO
 * (production To/Cc are listed in the body). Set false for real James/dept routing.
 */

import fs from "fs";
import path from "path";
import nodemailer from "nodemailer";

export type EmailSendResult = {
  ok: boolean;
  mocked: boolean;
  testing?: boolean;
  /** Actual inbox(es) the message was delivered to. */
  deliveredTo?: string[];
  /** Original To before testing redirect. */
  intendedTo?: string[];
  messageId?: string | null;
  error?: string;
};

export type BuiltEmail = {
  subject: string;
  text: string;
  html: string;
};

function env(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

/** Email-safe brand colors (hex — Gmail ignores oklch/CSS vars). */
const BRAND = {
  blue: "#1e4d9c",
  blueDark: "#163a78",
  blueSoft: "#e8f0fb",
  text: "#0f172a",
  muted: "#64748b",
  line: "#e2e8f0",
  card: "#ffffff",
  bg: "#f1f5f9",
  risk: "#b91c1c",
  riskSoft: "#fef2f2",
  warn: "#b45309",
  warnSoft: "#fffbeb",
  good: "#15803d",
};

/** Dark-mode palette (phones with Dark Mode / Apple Mail auto-adjust). */
const DARK = {
  bg: "#0b1220",
  card: "#152033",
  text: "#f1f5f9",
  muted: "#94a3b8",
  line: "#2a3a52",
  blueSoft: "#1a2f4d",
  riskSoft: "#3f1d1d",
  warnSoft: "#3f2e12",
  logoPlate: "#ffffff",
};

function emailDarkModeCss(): string {
  return `
<style type="text/css">
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  @media (prefers-color-scheme: dark) {
    .em-body, .em-outer { background-color: ${DARK.bg} !important; }
    .em-card { background-color: ${DARK.card} !important; border-color: ${DARK.line} !important; }
    .em-header { background: ${DARK.blueSoft} !important; background-color: ${DARK.blueSoft} !important; border-color: ${DARK.line} !important; }
    .em-title, .em-text, .em-strong { color: ${DARK.text} !important; }
    .em-muted, .em-label, .em-footer { color: ${DARK.muted} !important; }
    .em-line, .em-row td, .em-table, .em-table th, .em-table td { border-color: ${DARK.line} !important; }
    .em-table-head { background-color: ${DARK.bg} !important; }
    .em-soft, .em-comment { background-color: ${DARK.blueSoft} !important; border-color: ${DARK.line} !important; }
    .em-pill-risk { background-color: ${DARK.riskSoft} !important; }
    .em-pill-warn { background-color: ${DARK.warnSoft} !important; }
    .em-pill-blue { background-color: ${DARK.blueSoft} !important; }
    .em-logo-plate { background-color: ${DARK.logoPlate} !important; }
    .em-cta { background-color: ${BRAND.blue} !important; color: #ffffff !important; }
    .em-empty { background-color: ${DARK.bg} !important; border-color: ${DARK.line} !important; color: ${DARK.muted} !important; }
    .em-test { background-color: ${DARK.warnSoft} !important; color: #fbbf24 !important; border-color: #78350f !important; }
  }
  [data-ogsc] .em-body, [data-ogsc] .em-outer { background-color: ${DARK.bg} !important; }
  [data-ogsc] .em-card { background-color: ${DARK.card} !important; }
  [data-ogsc] .em-title, [data-ogsc] .em-text { color: ${DARK.text} !important; }
  [data-ogsc] .em-muted, [data-ogsc] .em-footer { color: ${DARK.muted} !important; }
</style>`;
}

function starBar(rating: number): string {
  const n = Math.max(0, Math.min(5, Math.round(rating)));
  const filled = "★".repeat(n);
  const empty = "☆".repeat(5 - n);
  return `<span class="em-stars" style="letter-spacing:2px;font-size:18px;color:${BRAND.warn};">${filled}<span style="color:#94a3b8;">${empty}</span></span>`;
}

function resolveLogoFilePath(): string | null {
  const candidates = [
    path.join(process.cwd(), "public", "logo.png"),
    path.join(process.cwd(), "logo.png"),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** Hosted URL override, else CID-attached public/logo.png (same as nav/sidebar). */
function brandLogoHtml(): string {
  const logoUrl = env("EMAIL_BRAND_LOGO_URL");
  const img = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="XXII Century" width="120" height="40" style="display:block;border:0;max-width:120px;height:auto;" />`
    : `<img src="cid:xxii-logo@goxxii" alt="XXII Century" width="120" height="40" style="display:block;border:0;max-width:120px;height:auto;" />`;
  // White plate keeps logo readable when clients invert/darken the header.
  return `<div class="em-logo-plate" style="display:inline-block;background:#ffffff;padding:8px 10px;border-radius:10px;line-height:0;">${img}</div>`;
}

function wrapRetentionEmailHtml(opts: {
  eyebrow: string;
  title: string;
  accent?: "risk" | "warn" | "blue";
  bodyHtml: string;
  ctaUrl?: string;
  ctaLabel?: string;
}): string {
  const accent =
    opts.accent === "warn"
      ? BRAND.warn
      : opts.accent === "blue"
        ? BRAND.blue
        : BRAND.risk;
  const accentSoft =
    opts.accent === "warn"
      ? BRAND.warnSoft
      : opts.accent === "blue"
        ? BRAND.blueSoft
        : BRAND.riskSoft;
  const pillClass =
    opts.accent === "warn"
      ? "em-pill-warn"
      : opts.accent === "blue"
        ? "em-pill-blue"
        : "em-pill-risk";

  const cta =
    opts.ctaUrl && opts.ctaLabel
      ? `
      <tr>
        <td style="padding:8px 32px 28px;">
          <a href="${escapeHtml(opts.ctaUrl)}"
             class="em-cta"
             style="display:inline-block;background:${BRAND.blue};color:#ffffff !important;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px;">
            ${escapeHtml(opts.ctaLabel)}
          </a>
        </td>
      </tr>`
      : "";

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>${escapeHtml(opts.title)}</title>
  ${emailDarkModeCss()}
</head>
<body class="em-body" bgcolor="${BRAND.bg}" style="margin:0;padding:0;background-color:${BRAND.bg};">
  <!-- Preheader spacer -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(opts.title)}</div>
  <table role="presentation" class="em-outer" width="100%" cellpadding="0" cellspacing="0" bgcolor="${BRAND.bg}" style="background-color:${BRAND.bg};padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" class="em-card" width="100%" cellpadding="0" cellspacing="0" bgcolor="${BRAND.card}" style="max-width:560px;background-color:${BRAND.card};border-radius:16px;overflow:hidden;border:1px solid ${BRAND.line};">
          <!--RETENTION_EMAIL_BANNER-->
          <tr>
            <td class="em-header" bgcolor="${BRAND.blueSoft}" style="background-color:${BRAND.blueSoft};padding:20px 28px;border-bottom:1px solid ${BRAND.line};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td valign="middle" style="width:140px;">${brandLogoHtml()}</td>
                  <td valign="middle" style="padding-left:14px;">
                    <div class="em-muted" style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:${BRAND.muted};">XXII Century</div>
                    <div class="em-title" style="font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:${BRAND.text};margin-top:2px;">Driver Retention</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 0;" bgcolor="${BRAND.card}">
              <div class="${pillClass}" style="display:inline-block;background:${accentSoft};color:${accent};font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;padding:6px 10px;border-radius:999px;">
                ${escapeHtml(opts.eyebrow)}
              </div>
            </td>
          </tr>
          <tr>
            <td class="em-title" bgcolor="${BRAND.card}" style="padding:12px 28px 8px;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:800;line-height:1.25;color:${BRAND.text};">
              ${escapeHtml(opts.title)}
            </td>
          </tr>
          <tr>
            <td bgcolor="${BRAND.card}" style="padding:4px 28px 8px;">
              ${opts.bodyHtml}
            </td>
          </tr>
          ${cta}
          <tr>
            <td class="em-footer em-line" bgcolor="${BRAND.card}" style="padding:16px 28px 24px;border-top:1px solid ${BRAND.line};font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:${BRAND.muted};">
              Sent by XXII Century Notifications · Reply to this email to reach leadership.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function detailRow(label: string, valueHtml: string): string {
  return `
    <tr class="em-row">
      <td class="em-label em-line" style="padding:10px 0;border-bottom:1px solid ${BRAND.line};font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;color:${BRAND.muted};width:34%;vertical-align:top;">
        ${escapeHtml(label)}
      </td>
      <td class="em-text em-line" style="padding:10px 0;border-bottom:1px solid ${BRAND.line};font-family:Arial,Helvetica,sans-serif;font-size:14px;color:${BRAND.text};vertical-align:top;">
        ${valueHtml}
      </td>
    </tr>`;
}

function commentBlock(label: string, comment: string): string {
  const trimmed = String(comment || "").trim();
  if (!trimmed) return "";
  const body = escapeHtml(trimmed).replace(/\n/g, "<br/>");
  return `
    <div class="em-comment em-soft" style="margin:16px 0 8px;padding:14px 16px;background-color:${BRAND.blueSoft};border-radius:12px;border:1px solid ${BRAND.line};">
      <div class="em-muted" style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:${BRAND.muted};margin-bottom:6px;">
        ${escapeHtml(label)}
      </div>
      <div class="em-text" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:${BRAND.text};">
        ${body}
      </div>
    </div>`;
}

export function isSmtpConfigured(): boolean {
  return Boolean(env("SMTP_HOST") && env("SMTP_USER") && env("SMTP_PASS"));
}

/** When true, do not email James / departments — send only to the test inbox. */
export function isRetentionEmailTesting(): boolean {
  const v = env("RETENTION_EMAIL_TESTING", "false").toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function retentionEmailTestTo(): string {
  return env("RETENTION_EMAIL_TEST_TO", "shahmeer@azfsllc.com");
}

export function jamesEmail(): string {
  return env("JAMES_EMAIL", "James@goxxii.com");
}

export function mailFromAddress(): string {
  return env("SMTP_FROM", "notifications@goxxii.com");
}

export function mailFromName(): string {
  return env("SMTP_FROM_NAME", "XXII Century Notifications");
}

export function mailReplyTo(): string {
  return env("SMTP_REPLY_TO", jamesEmail());
}

function uniqueEmails(list: string[]): string[] {
  return [
    ...new Set(
      list
        .map((e) => String(e || "").trim())
        .filter((e) => e.includes("@"))
    ),
  ];
}

function escapeHtml(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function applyTestingRedirect(
  to: string[],
  cc: string[]
): {
  to: string[];
  cc: string[];
  testing: boolean;
  intendedTo: string[];
  intendedCc: string[];
  subjectPrefix: string;
  textPrefix: string;
  htmlBanner: string;
} {
  if (!isRetentionEmailTesting()) {
    return {
      to,
      cc,
      testing: false,
      intendedTo: to,
      intendedCc: cc,
      subjectPrefix: "",
      textPrefix: "",
      htmlBanner: "",
    };
  }
  const testTo = retentionEmailTestTo();
  return {
    to: [testTo],
    cc: [],
    testing: true,
    intendedTo: to,
    intendedCc: cc,
    subjectPrefix: "[TEST] ",
    textPrefix: [
      `[TEST MODE] This email was redirected to ${testTo}.`,
      `Would have sent — To: ${to.join(", ") || "(none)"}`,
      `Would have sent — Cc: ${cc.join(", ") || "(none)"}`,
      ``,
      `---`,
      ``,
    ].join("\n"),
    htmlBanner: `
      <tr>
        <td class="em-test" style="background:${BRAND.warnSoft};color:${BRAND.warn};font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;padding:10px 28px;border-bottom:1px solid #fde68a;">
          TEST MODE — redirected to ${escapeHtml(testTo)}. Intended To: ${escapeHtml(to.join(", ") || "(none)")}${cc.length ? ` · Cc: ${escapeHtml(cc.join(", "))}` : ""}
        </td>
      </tr>`,
  };
}

export async function sendRetentionEmail(opts: {
  to: string | string[];
  cc?: string | string[];
  subject: string;
  text: string;
  html?: string;
}): Promise<EmailSendResult> {
  const intendedTo = uniqueEmails(
    Array.isArray(opts.to) ? opts.to : [opts.to]
  );
  const intendedCc = uniqueEmails(
    Array.isArray(opts.cc) ? opts.cc : opts.cc ? [opts.cc] : []
  );
  if (!intendedTo.length) {
    return { ok: false, mocked: false, error: "No email recipients" };
  }

  const redirected = applyTestingRedirect(intendedTo, intendedCc);
  const to = redirected.to;
  const cc = redirected.cc;
  const subject = `${redirected.subjectPrefix}${opts.subject}`;
  const text = `${redirected.textPrefix}${opts.text}`;
  let html = opts.html;
  if (html && redirected.htmlBanner) {
    html = html.replace(
      "<!--RETENTION_EMAIL_BANNER-->",
      redirected.htmlBanner
    );
  }

  if (!isSmtpConfigured()) {
    console.log("[email:mock]", {
      testing: redirected.testing,
      to,
      cc,
      intendedTo: redirected.intendedTo,
      intendedCc: redirected.intendedCc,
      subject,
      from: `${mailFromName()} <${mailFromAddress()}>`,
      preview: text.slice(0, 240),
      hasHtml: Boolean(html),
    });
    return {
      ok: true,
      mocked: true,
      testing: redirected.testing,
      deliveredTo: to,
      intendedTo: redirected.intendedTo,
      messageId: `mock-email-${Date.now()}`,
    };
  }

  try {
    const port = Number(env("SMTP_PORT", "587")) || 587;
    const secure =
      env("SMTP_SECURE", port === 465 ? "true" : "false").toLowerCase() ===
      "true";
    const transporter = nodemailer.createTransport({
      host: env("SMTP_HOST"),
      port,
      secure,
      requireTLS: !secure && port === 587,
      auth: {
        user: env("SMTP_USER"),
        pass: env("SMTP_PASS"),
      },
    });

    const logoPath =
      !env("EMAIL_BRAND_LOGO_URL") && html ? resolveLogoFilePath() : null;
    const attachments = logoPath
      ? [
          {
            filename: "logo.png",
            path: logoPath,
            cid: "xxii-logo@goxxii",
            contentDisposition: "inline" as const,
            contentType: "image/png",
          },
        ]
      : undefined;

    const info = await transporter.sendMail({
      from: `"${mailFromName()}" <${mailFromAddress()}>`,
      replyTo: mailReplyTo(),
      to: to.join(", "),
      cc: cc.length ? cc.join(", ") : undefined,
      subject,
      text,
      html: html || undefined,
      attachments,
    });

    console.log("[email:sent]", {
      testing: redirected.testing,
      to,
      cc,
      intendedTo: redirected.intendedTo,
      intendedCc: redirected.intendedCc,
      subject,
      messageId: info.messageId,
      hasHtml: Boolean(html),
    });
    return {
      ok: true,
      mocked: false,
      testing: redirected.testing,
      deliveredTo: to,
      intendedTo: redirected.intendedTo,
      messageId: info.messageId || null,
    };
  } catch (e) {
    console.error("[email:error]", (e as Error).message);
    return {
      ok: false,
      mocked: false,
      testing: redirected.testing,
      deliveredTo: to,
      intendedTo: redirected.intendedTo,
      error: (e as Error).message,
    };
  }
}

export function buildAtRiskOverallEmail(opts: {
  driverName: string;
  driverId: string;
  overallRating: number;
  generalComment: string;
  dispatcher?: string;
  departmentFeedback: { department: string; rating: number; comment?: string }[];
  caseUrl?: string;
}): BuiltEmail {
  const driverComment =
    String(opts.generalComment || "").trim() ||
    opts.departmentFeedback
      .filter((d) => String(d.comment || "").trim())
      .map((d) => `${d.department}: ${String(d.comment).trim()}`)
      .join("\n");

  const lines = [
    `Driver at risk — low overall survey rating`,
    ``,
    `Driver: ${opts.driverName} (ID ${opts.driverId})`,
    opts.dispatcher ? `Dispatcher: ${opts.dispatcher}` : null,
    `Overall rating: ${opts.overallRating}/5`,
    ``,
    `Comment:`,
    driverComment || "(none)",
    ``,
    `Department ratings:`,
    ...opts.departmentFeedback.map(
      (d) =>
        `• ${d.department}: ${d.rating}/5${d.comment ? ` — ${d.comment}` : ""}`
    ),
    opts.caseUrl ? `` : null,
    opts.caseUrl ? `Open case: ${opts.caseUrl}` : null,
    ``,
    `— XXII Century Retention`,
  ].filter((x) => x !== null) as string[];

  const deptRows = opts.departmentFeedback
    .map((d) => {
      const risk = d.rating <= 3;
      const note = String(d.comment || "").trim();
      return `
        <tr>
          <td class="em-text em-line" style="padding:10px 12px;border-bottom:1px solid ${BRAND.line};font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:${BRAND.text};">
            ${escapeHtml(d.department)}
          </td>
          <td class="em-line" style="padding:10px 12px;border-bottom:1px solid ${BRAND.line};text-align:center;">
            ${starBar(d.rating)}
            <div class="${risk ? "" : "em-muted"}" style="font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;color:${risk ? BRAND.risk : BRAND.muted};margin-top:2px;">
              ${d.rating}/5
            </div>
          </td>
          <td class="em-muted em-line" style="padding:10px 12px;border-bottom:1px solid ${BRAND.line};font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${BRAND.muted};">
            ${escapeHtml(note || "—")}
          </td>
        </tr>`;
    })
    .join("");

  const bodyHtml = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:4px;">
      ${detailRow("Driver", `<strong class="em-strong">${escapeHtml(opts.driverName)}</strong><br/><span class="em-muted" style="color:${BRAND.muted};font-size:12px;">ID ${escapeHtml(opts.driverId)}</span>`)}
      ${
        opts.dispatcher
          ? detailRow("Dispatcher", escapeHtml(opts.dispatcher))
          : ""
      }
      ${detailRow("Overall rating", `${starBar(opts.overallRating)}&nbsp;&nbsp;<strong style="color:${BRAND.risk};">${opts.overallRating}/5</strong>`)}
    </table>
    ${
      driverComment
        ? commentBlock("Driver comment", driverComment)
        : `<div class="em-empty" style="margin:16px 0 8px;padding:14px 16px;background:${BRAND.bg};border-radius:12px;border:1px dashed ${BRAND.line};font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${BRAND.muted};">No written comment was provided.</div>`
    }
    <div class="em-muted" style="margin:18px 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:${BRAND.muted};">
      Department ratings
    </div>
    <table role="presentation" class="em-table" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BRAND.line};border-radius:12px;overflow:hidden;">
      <tr class="em-table-head" style="background:${BRAND.bg};">
        <th align="left" class="em-muted" style="padding:8px 12px;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:800;color:${BRAND.muted};text-transform:uppercase;">Dept</th>
        <th align="center" class="em-muted" style="padding:8px 12px;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:800;color:${BRAND.muted};text-transform:uppercase;">Rating</th>
        <th align="left" class="em-muted" style="padding:8px 12px;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:800;color:${BRAND.muted};text-transform:uppercase;">Note</th>
      </tr>
      ${deptRows}
    </table>`;

  return {
    subject: `At Risk — ${opts.driverName} rated ${opts.overallRating}/5`,
    text: lines.join("\n"),
    html: wrapRetentionEmailHtml({
      eyebrow: "At risk alert",
      title: `${opts.driverName} rated ${opts.overallRating}/5`,
      accent: "risk",
      bodyHtml,
      ctaUrl: opts.caseUrl,
      ctaLabel: "Open driver case",
    }),
  };
}

export function buildDepartmentLowEmail(opts: {
  driverName: string;
  driverId: string;
  department: string;
  rating: number;
  comment?: string;
  overallRating: number;
  caseUrl?: string;
}): BuiltEmail {
  const deptNote = String(opts.comment || "").trim();

  const lines = [
    `Low ${opts.department} rating from driver survey`,
    ``,
    `Driver: ${opts.driverName} (ID ${opts.driverId})`,
    `Department: ${opts.department} — ${opts.rating}/5`,
    `Overall: ${opts.overallRating}/5`,
    ``,
    deptNote ? `Department note: ${deptNote}` : `Comment: (none)`,
    opts.caseUrl ? `` : null,
    opts.caseUrl ? `Open case: ${opts.caseUrl}` : null,
    ``,
    `— XXII Century Retention`,
  ].filter((x) => x !== null) as string[];

  const bodyHtml = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:4px;">
      ${detailRow("Driver", `<strong>${escapeHtml(opts.driverName)}</strong><br/><span style="color:${BRAND.muted};font-size:12px;">ID ${escapeHtml(opts.driverId)}</span>`)}
      ${detailRow("Department", `<strong>${escapeHtml(opts.department)}</strong>`)}
      ${detailRow("Department rating", `${starBar(opts.rating)}&nbsp;&nbsp;<strong style="color:${BRAND.risk};">${opts.rating}/5</strong>`)}
      ${detailRow("Overall rating", `${starBar(opts.overallRating)}&nbsp;&nbsp;<strong>${opts.overallRating}/5</strong>`)}
    </table>
    ${
      deptNote
        ? commentBlock(`${opts.department} note`, deptNote)
        : ""
    }`;

  return {
    subject: `Low ${opts.department} rating — ${opts.driverName}`,
    text: lines.join("\n"),
    html: wrapRetentionEmailHtml({
      eyebrow: `${opts.department} alert`,
      title: `Low ${opts.department} rating`,
      accent: "warn",
      bodyHtml,
      ctaUrl: opts.caseUrl,
      ctaLabel: "Open driver case",
    }),
  };
}

export function buildBirthdayLeadershipEmail(opts: {
  driverName: string;
  driverId: string;
  noticeText: string;
}): BuiltEmail {
  const bodyHtml = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:4px;">
      ${detailRow("Driver", `<strong>${escapeHtml(opts.driverName)}</strong><br/><span style="color:${BRAND.muted};font-size:12px;">ID ${escapeHtml(opts.driverId)}</span>`)}
    </table>
    ${commentBlock("Notice", opts.noticeText)}`;

  return {
    subject: `Driver birthday today — ${opts.driverName}`,
    text: opts.noticeText,
    html: wrapRetentionEmailHtml({
      eyebrow: "Birthday",
      title: `${opts.driverName}'s birthday`,
      accent: "blue",
      bodyHtml,
    }),
  };
}
