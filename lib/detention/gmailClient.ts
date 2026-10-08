/**
 * Minimal Gmail API client for Detention intake (read-only).
 */
import { getValidGmailAccessToken } from "@/lib/detention/gmailOAuth";

type GmailListResponse = {
  messages?: { id: string; threadId: string }[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
  error?: { message?: string };
};

type GmailMessage = {
  id: string;
  threadId: string;
  internalDate?: string;
  payload?: {
    headers?: { name: string; value: string }[];
    mimeType?: string;
    body?: { data?: string };
    parts?: GmailMessage["payload"][];
  };
  error?: { message?: string };
};

function header(
  headers: { name: string; value: string }[] | undefined,
  name: string
): string {
  const h = (headers || []).find(
    (x) => x.name.toLowerCase() === name.toLowerCase()
  );
  return h?.value || "";
}

function decodeBody(data?: string): string {
  if (!data) return "";
  const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64").toString("utf8");
}

function walkParts(
  part: GmailMessage["payload"] | undefined,
  out: { plain: string; html: string }
): void {
  if (!part) return;
  const mt = (part.mimeType || "").toLowerCase();
  if (mt === "text/plain" && part.body?.data) {
    out.plain += decodeBody(part.body.data);
  } else if (mt === "text/html" && part.body?.data) {
    out.html += decodeBody(part.body.data);
  }
  for (const child of part.parts || []) walkParts(child, out);
}

export type GmailDetentionMessage = {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  cc: string;
  dateHeader: string;
  internalDate: Date | null;
  plainBody: string;
  htmlBody: string;
};

export async function listDetentionMessageIds(opts: {
  lookbackDays: number;
  maxResults?: number;
}): Promise<{ id: string; threadId: string }[]> {
  const { accessToken } = await getValidGmailAccessToken();
  const lookback = Math.max(1, Math.min(90, opts.lookbackDays || 14));
  const maxResults = opts.maxResults ?? 2000;
  const q = [
    "from:notifications@openroadtms.com",
    'subject:"Detention completed"',
    `newer_than:${lookback}d`,
  ].join(" ");

  const out: { id: string; threadId: string }[] = [];
  let pageToken = "";

  while (out.length < maxResults) {
    const params = new URLSearchParams({
      q,
      maxResults: String(Math.min(100, maxResults - out.length)),
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const json = (await res.json()) as GmailListResponse;
    if (!res.ok) {
      throw new Error(json.error?.message || `Gmail list failed (${res.status})`);
    }
    for (const m of json.messages || []) {
      out.push({ id: m.id, threadId: m.threadId });
    }
    if (!json.nextPageToken) break;
    pageToken = json.nextPageToken;
  }

  return out;
}

export async function getDetentionMessage(
  messageId: string
): Promise<GmailDetentionMessage> {
  const { accessToken } = await getValidGmailAccessToken();
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(
      messageId
    )}?format=full`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const json = (await res.json()) as GmailMessage;
  if (!res.ok) {
    throw new Error(json.error?.message || `Gmail get failed (${res.status})`);
  }

  const bodies = { plain: "", html: "" };
  walkParts(json.payload, bodies);
  if (!bodies.plain && !bodies.html && json.payload?.body?.data) {
    const raw = decodeBody(json.payload.body.data);
    if ((json.payload.mimeType || "").includes("html")) bodies.html = raw;
    else bodies.plain = raw;
  }

  const headers = json.payload?.headers;
  const internalMs = json.internalDate ? Number(json.internalDate) : NaN;

  return {
    id: json.id,
    threadId: json.threadId,
    subject: header(headers, "Subject"),
    from: header(headers, "From"),
    to: header(headers, "To"),
    cc: header(headers, "Cc"),
    dateHeader: header(headers, "Date"),
    internalDate: Number.isFinite(internalMs) ? new Date(internalMs) : null,
    plainBody: bodies.plain,
    htmlBody: bodies.html,
  };
}

export { buildGmailThreadUrl as gmailThreadUrl } from "./gmailLinks";
