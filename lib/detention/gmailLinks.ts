/**
 * Gmail deep-links from Art's sheet only work in the mailbox that received
 * the OpenRoad detention emails. Prefer #all/ over #inbox/, and always offer
 * a search fallback by load / shipment so other users can find the mail.
 */
export function normalizeGmailThreadUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  const raw = url.trim();
  // #inbox/<hex> → #all/<hex> (still works after leave inbox / archive)
  return raw.replace(/\/mail\/u\/(\d+)\/#inbox\//i, "/mail/u/$1/#all/");
}

export function gmailSearchUrl(opts: {
  loadNumber?: string | null;
  shipmentNumber?: string | null;
}): string | null {
  const parts: string[] = ['"Detention completed"'];
  if (opts.loadNumber?.trim()) {
    parts.push(`"Load #${opts.loadNumber.trim().replace(/^#/, "")}"`);
  } else if (opts.shipmentNumber?.trim()) {
    parts.push(`shipment ${opts.shipmentNumber.trim()}`);
  } else {
    return null;
  }
  const q = encodeURIComponent(parts.join(" "));
  return `https://mail.google.com/mail/#search/${q}`;
}
