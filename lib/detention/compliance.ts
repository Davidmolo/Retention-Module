/**
 * Dispatcher 48h compliance + “No follow up” rules (Mantas).
 *
 * - pending: still inside 48h of the detention email, no dispatcher reply yet
 * - ok: dispatcher replied within 48h of the email (and still actively recent, or claim closed)
 * - missed: no dispatcher reply at all after 48h (“No reply ≤48h”)
 * - no_follow_up: dispatcher replied at least once, but no further dispatcher
 *   answer for 48h+ while the claim is still open — or replied only after the
 *   initial 48h window and claim is still pending
 * - n/a: cannot evaluate (no dispatcher email)
 */
export const COMPLIANCE_WINDOW_MS = 48 * 60 * 60 * 1000;

export type ComplianceValue =
  | "ok"
  | "missed"
  | "pending"
  | "no_follow_up"
  | "n/a";

const CLOSED = new Set(["Paid", "Denied"]);

export function resolveDispatcherCompliance(opts: {
  status: string;
  emailDate: Date | string | null | undefined;
  repliedAt: Date | string | null | undefined;
  stored?: string | null;
  /** When false, we cannot scan Gmail for this dispatcher on this row. */
  hasDispatcherEmail?: boolean;
  nowMs?: number;
}): ComplianceValue {
  // Per-row: missing mailbox ⇒ N/A (even if another detention for the same
  // person has an email — compliance is checked per thread).
  if (opts.hasDispatcherEmail === false && !opts.repliedAt) return "n/a";
  // Legacy rows stuck as stored n/a with no reply — keep N/A unless caller
  // now says we have an email (re-scan will overwrite stored).
  if (
    opts.stored === "n/a" &&
    !opts.repliedAt &&
    opts.hasDispatcherEmail !== true
  ) {
    return "n/a";
  }

  const now = opts.nowMs ?? Date.now();
  const emailMs = opts.emailDate ? new Date(opts.emailDate).getTime() : NaN;
  const replyMs = opts.repliedAt ? new Date(opts.repliedAt).getTime() : NaN;
  const open = !CLOSED.has(String(opts.status || ""));

  if (Number.isFinite(replyMs)) {
    const withinInitial48 =
      Number.isFinite(emailMs) && replyMs <= emailMs + COMPLIANCE_WINDOW_MS;
    const silentFor48 = now - replyMs >= COMPLIANCE_WINDOW_MS;

    if (open && silentFor48) return "no_follow_up";
    if (open && !withinInitial48) return "no_follow_up";
    if (withinInitial48) return "ok";
    // Late reply on a closed claim — treat as no follow-up history
    return "no_follow_up";
  }

  if (Number.isFinite(emailMs)) {
    if (now <= emailMs + COMPLIANCE_WINDOW_MS) return "pending";
    return "missed";
  }

  return (opts.stored as ComplianceValue) || "n/a";
}
