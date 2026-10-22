/**
 * 48h compliance.
 *
 * Dispatcher (or Art):
 * - pending: still inside 48h of the detention email, no dispatcher/Art reply yet
 * - ok: dispatcher or Art replied. A dispatcher reply is compliance even when
 *   nobody follows up again. Art’s reply also counts as answered.
 * - missed: no dispatcher or Art reply after 48h
 * - n/a: cannot evaluate (no dispatcher/Art mailbox to score)
 *
 * Accounts Receivable (ar@):
 * - n/a: dispatcher and Art have not answered yet
 * - pending: dispatcher or Art answered, still inside 48h, no ar@ email yet
 * - ok: ar@ emailed within 48h of that answer (or the claim is Paid/Denied)
 * - no_follow_up: dispatcher or Art answered, 48h passed, ar@ did not email
 *   in that window
 */
export const COMPLIANCE_WINDOW_MS = 48 * 60 * 60 * 1000;

export type ComplianceValue =
  | "ok"
  | "missed"
  | "pending"
  | "no_follow_up"
  | "n/a";

const CLOSED = new Set(["Paid", "Denied"]);

function parseEmailList(raw: string): string[] {
  return raw
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"));
}

/** Mailbox whose message in the thread is the AR follow-up. */
export function arReplyEmails(): string[] {
  return parseEmailList(
    process.env.DETENTION_AR_REPLY_EMAILS?.trim() || "ar@goxxii.com"
  );
}

/** Art mailboxes that count as an answer for dispatcher compliance. */
export function artReplyEmails(): string[] {
  const ar = new Set(arReplyEmails());
  return parseEmailList(
    process.env.DETENTION_ART_REPLY_EMAILS?.trim() || "art@goxxii.com"
  ).filter((e) => !ar.has(e));
}

export function isArMailbox(email: string | null | undefined): boolean {
  if (!email) return false;
  return arReplyEmails().includes(email.trim().toLowerCase());
}

function toMs(value: Date | string | null | undefined): number {
  if (!value) return NaN;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : NaN;
}

export function resolveDispatcherCompliance(opts: {
  status: string;
  emailDate: Date | string | null | undefined;
  repliedAt: Date | string | null | undefined;
  stored?: string | null;
  /** When false, we cannot scan Gmail for this dispatcher on this row. */
  hasDispatcherEmail?: boolean;
  nowMs?: number;
}): ComplianceValue {
  if (opts.hasDispatcherEmail === false && !opts.repliedAt) return "n/a";
  if (
    opts.stored === "n/a" &&
    !opts.repliedAt &&
    opts.hasDispatcherEmail !== true
  ) {
    return "n/a";
  }

  const now = opts.nowMs ?? Date.now();
  const emailMs = toMs(opts.emailDate);
  const replyMs = toMs(opts.repliedAt);
  const open = !CLOSED.has(String(opts.status || ""));

  if (!open) {
    if (Number.isFinite(replyMs)) return "ok";
    if (Number.isFinite(emailMs)) {
      if (now <= emailMs + COMPLIANCE_WINDOW_MS) return "pending";
      return "missed";
    }
    return (opts.stored as ComplianceValue) || "n/a";
  }

  // Dispatcher or Art answered — that is dispatcher compliance.
  // A missing later follow-up belongs to Accounts Receivable.
  if (Number.isFinite(replyMs)) return "ok";

  if (Number.isFinite(emailMs)) {
    if (now <= emailMs + COMPLIANCE_WINDOW_MS) return "pending";
    return "missed";
  }

  return (opts.stored as ComplianceValue) || "n/a";
}

export function resolveArCompliance(opts: {
  status: string;
  /** First reply from the dispatcher or Art. */
  teamRepliedAt: Date | string | null | undefined;
  /** First email from ar@ after the detention email. */
  arRepliedAt: Date | string | null | undefined;
  nowMs?: number;
}): ComplianceValue {
  const teamMs = toMs(opts.teamRepliedAt);
  if (!Number.isFinite(teamMs)) return "n/a";

  if (CLOSED.has(String(opts.status || ""))) return "ok";

  const now = opts.nowMs ?? Date.now();
  const arMs = toMs(opts.arRepliedAt);
  const deadline = teamMs + COMPLIANCE_WINDOW_MS;
  if (Number.isFinite(arMs) && arMs <= deadline) return "ok";
  if (now <= deadline) return "pending";
  return "no_follow_up";
}
