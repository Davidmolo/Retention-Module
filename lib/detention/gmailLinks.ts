/**
 * Gmail thread ids belong to the mailbox that ingested the detention
 * (usually ar@). Opening that id with authuser=ar@, or with /mail/#search
 * and no account index, sends David and other members to their own inbox.
 *
 * Search the account they are already signed into (/mail/u/0/#search/…).
 * The detention notice is in that mailbox. The query is the OpenRoad
 * subject plus the load and shipment numbers.
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

/** Open this detention in the Gmail account the viewer is signed into. */
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
  const parts: string[] = ["in:anywhere", '"Detention completed"'];
  const ors: string[] = [];
  if (load) ors.push(load);
  if (ship && ship !== load) {
    ors.push(ship);
    ors.push(`"Load #${ship}"`);
  }
  if (ors.length === 1) parts.push(ors[0]);
  else parts.push(`(${ors.join(" OR ")})`);

  const q = encodeURIComponent(parts.join(" ")).replace(/%20/g, "+");
  return `https://mail.google.com/mail/u/0/#search/${q}`;
}

export function detentionGmailMailboxLabel(): string {
  return mailboxEmail();
}
