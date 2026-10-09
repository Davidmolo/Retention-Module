/**
 * Gmail deep-links for detention threads live in the shared AR mailbox
 * (usually ar@goxxii.com). Links that use /mail/u/0/ open whatever account
 * is signed in as slot 0 in the browser — often the user's personal inbox —
 * so Gmail can't find the thread and dumps them in Inbox.
 *
 * Prefer authuser=<mailbox> so Gmail switches to the right account when it
 * is already signed in. Always offer a search fallback by load/shipment.
 */

function mailboxEmail(): string {
  return (
    process.env.NEXT_PUBLIC_DETENTION_GMAIL_EMAIL?.trim() ||
    process.env.DETENTION_GMAIL_EMAIL?.trim() ||
    "ar@goxxii.com"
  ).toLowerCase();
}

/** Extract Gmail thread hex id from a stored URL or raw id. */
export function extractGmailThreadId(
  urlOrId: string | null | undefined
): string | null {
  if (!urlOrId?.trim()) return null;
  const raw = urlOrId.trim();
  if (/^[0-9a-f]+$/i.test(raw)) return raw;
  const m =
    raw.match(/#[^/]*\/([0-9a-f]+)/i) ||
    raw.match(/\/([0-9a-f]{10,})\/?$/i);
  return m?.[1] || null;
}

/**
 * Build / rewrite a thread URL that opens in the detention mailbox.
 * Returns null when there is no usable thread id.
 */
export function normalizeGmailThreadUrl(
  url: string | null | undefined
): string | null {
  const threadId = extractGmailThreadId(url);
  if (!threadId) return null;
  return buildGmailThreadUrl(threadId);
}

export function buildGmailThreadUrl(threadId: string): string {
  const auth = encodeURIComponent(mailboxEmail());
  return `https://mail.google.com/mail/?authuser=${auth}#all/${threadId}`;
}

export function gmailSearchUrl(opts: {
  loadNumber?: string | null;
  shipmentNumber?: string | null;
}): string | null {
  const load = opts.loadNumber?.trim().replace(/^#/, "") || "";
  const ship = opts.shipmentNumber?.trim().replace(/^#/, "") || "";
  if (!load && !ship) return null;

  // OpenRoad subject uses shipment as "Load #NNNN"; the real load number is
  // only in the body as "Load Number: #XXXX". Phrase-searching "Load #<load>"
  // therefore misses. Search "Detention completed" + bare numbers (OR).
  const parts: string[] = ['"Detention completed"'];
  const ors: string[] = [];
  if (load) ors.push(load);
  if (ship && ship !== load) {
    ors.push(ship);
    // Subject-line form: Detention completed: Load #<shipment>
    ors.push(`"Load #${ship}"`);
  }
  if (ors.length === 1) parts.push(ors[0]);
  else parts.push(`(${ors.join(" OR ")})`);

  const q = encodeURIComponent(parts.join(" "));
  const auth = encodeURIComponent(mailboxEmail());
  return `https://mail.google.com/mail/?authuser=${auth}#search/${q}`;
}

export function detentionGmailMailboxLabel(): string {
  return mailboxEmail();
}
