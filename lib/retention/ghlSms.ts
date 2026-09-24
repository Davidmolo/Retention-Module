/**
 * GoHighLevel (LeadConnector) SMS via Conversations API.
 *
 * XXII Century Retention only — use XXII Century Inc location credentials.
 * Do not use AZFS/FMS GHL location or keys (separate company).
 *
 * Needs:
 *   GHL_LOCATION_ID (or ghl_locationID)
 *   GHL_PRIVATE_INTEGRATION_KEY (or ghl_private_integration_key)
 *   GHL_API_VERSION (default 2021-07-28)
 */

const GHL_API_BASE = "https://services.leadconnectorhq.com";

function envFirst(...keys: string[]): string {
  for (const k of keys) {
    const v = process.env[k]?.trim();
    if (v) return v;
  }
  return "";
}

export function getGhlSmsConfig() {
  const locationId = envFirst("GHL_LOCATION_ID", "ghl_locationID");
  const token = envFirst(
    "GHL_PRIVATE_INTEGRATION_KEY",
    "ghl_private_integration_key"
  );
  const version =
    envFirst("GHL_API_VERSION", "ghl_api_version") || "2021-07-28";
  return { locationId, token, version };
}

export function isGhlSmsConfigured(): boolean {
  const { locationId, token } = getGhlSmsConfig();
  return Boolean(locationId && token);
}

function digitsOnly(raw: string): string {
  return String(raw || "").replace(/\D/g, "");
}

async function ghlRequest(
  pathWithQuery: string,
  opts: { method?: string; body?: unknown; timeoutMs?: number } = {}
): Promise<Record<string, unknown>> {
  const { token, version } = getGhlSmsConfig();
  const method = opts.method || "GET";
  const timeoutMs = opts.timeoutMs ?? 20000;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Version: version,
  };
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${GHL_API_BASE}${pathWithQuery}`, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const msg =
        (data.message as string) ||
        (data.error as string) ||
        `GHL API failed (${res.status})`;
      const err = new Error(msg) as Error & { status?: number; data?: unknown };
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function phoneMatches(a: string, b: string): boolean {
  const da = digitsOnly(a);
  const db = digitsOnly(b);
  if (!da || !db) return false;
  return da === db || da.endsWith(db) || db.endsWith(da);
}

function phoneQueryVariants(phoneE164: string): string[] {
  const digits = digitsOnly(phoneE164);
  const variants = new Set<string>();
  if (phoneE164) variants.add(phoneE164);
  if (digits) {
    variants.add(digits);
    if (digits.length === 11 && digits.startsWith("1")) {
      variants.add(digits.slice(1));
      variants.add(`+${digits}`);
    } else if (digits.length === 10) {
      variants.add(`1${digits}`);
      variants.add(`+1${digits}`);
    }
  }
  return [...variants];
}

/** Find existing GHL contact by phone for this location. */
export async function findGhlContactIdByPhone(
  phoneE164: string
): Promise<string | null> {
  const { locationId } = getGhlSmsConfig();
  for (const query of phoneQueryVariants(phoneE164)) {
    const data = await ghlRequest(
      `/contacts/?locationId=${encodeURIComponent(locationId)}&query=${encodeURIComponent(query)}&limit=20`,
      { timeoutMs: 15000 }
    );
    const contacts = Array.isArray(data.contacts) ? data.contacts : [];
    const match = contacts.find((c) => {
      const row = c as { phone?: string; phoneNumber?: string; id?: string };
      return phoneMatches(row.phone || row.phoneNumber || "", phoneE164);
    }) as { id?: string } | undefined;
    if (match?.id) return String(match.id);
  }
  return null;
}

function extractDuplicateContactId(err: Error & { data?: unknown }): string | null {
  const data = (err.data || {}) as Record<string, unknown>;
  const meta = (data.meta || data) as Record<string, unknown>;
  const candidates = [
    meta.contactId,
    meta.duplicateContactId,
    meta.existingContactId,
    data.contactId,
    (data.contact as { id?: string } | undefined)?.id,
  ];
  for (const c of candidates) {
    if (c && String(c).trim()) return String(c).trim();
  }
  // Sometimes message embeds an id
  const msg = String(err.message || "");
  const m = /contact[s]?[\/\s:-]+([A-Za-z0-9]{10,})/i.exec(msg);
  return m?.[1] || null;
}

/** Create a minimal GHL contact so Conversations can SMS them. */
export async function createGhlContact(opts: {
  phoneE164: string;
  name?: string;
}): Promise<string> {
  const { locationId } = getGhlSmsConfig();
  const parts = String(opts.name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const firstName = parts[0] || "Driver";
  const lastName = parts.slice(1).join(" ") || "";

  try {
    const data = await ghlRequest("/contacts/", {
      method: "POST",
      body: {
        locationId,
        firstName,
        lastName: lastName || undefined,
        phone: opts.phoneE164,
      source: "XXII Century Retention",
      tags: ["retention", "xxii-century"],
      },
      timeoutMs: 20000,
    });

    const contact =
      (data.contact as { id?: string } | undefined) ||
      (data as { id?: string });
    const id = contact?.id ? String(contact.id) : "";
    if (!id) {
      throw new Error("GHL contact create returned no id");
    }
    return id;
  } catch (e) {
    const err = e as Error & { data?: unknown; status?: number };
    const msg = String(err.message || "");
    const isDup = /duplicat/i.test(msg);
    if (isDup) {
      const fromMeta = extractDuplicateContactId(err);
      if (fromMeta) return fromMeta;
      // Race / strict uniqueness: contact exists but first search missed it
      const again = await findGhlContactIdByPhone(opts.phoneE164);
      if (again) return again;
    }
    throw err;
  }
}

export async function ensureGhlContactId(opts: {
  phoneE164: string;
  name?: string;
}): Promise<string> {
  const existing = await findGhlContactIdByPhone(opts.phoneE164);
  if (existing) return existing;
  return createGhlContact(opts);
}

/** Clear SMS Do-Not-Disturb on a contact (STOP / failed delivery can flip this on). */
export async function clearGhlSmsDnd(contactId: string): Promise<boolean> {
  const id = String(contactId || "").trim();
  if (!id) return false;
  try {
    const data = await ghlRequest(`/contacts/${encodeURIComponent(id)}`, {
      timeoutMs: 10000,
    });
    const contact = (data.contact as Record<string, unknown>) || {};
    const dndSettings = (contact.dndSettings || {}) as Record<
      string,
      { status?: string }
    >;
    const smsStatus = String(dndSettings.SMS?.status || "").toLowerCase();
    if (smsStatus !== "active" && contact.dnd !== true) return false;

    await ghlRequest(`/contacts/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: {
        dnd: false,
        dndSettings: {
          SMS: { status: "inactive", message: "", code: "" },
        },
      },
      timeoutMs: 15000,
    });
    console.log("[ghl] cleared SMS DND", { contactId: id });
    return true;
  } catch (e) {
    console.warn("[ghl] clear SMS DND failed", (e as Error).message);
    return false;
  }
}

/** Fetch outbound message status (failed / delivered / etc.). */
export async function getGhlMessageStatus(messageId: string): Promise<{
  status: string;
  error: string | null;
}> {
  const id = String(messageId || "").trim();
  if (!id) return { status: "", error: null };
  const data = await ghlRequest(
    `/conversations/messages/${encodeURIComponent(id)}`,
    { timeoutMs: 10000 }
  );
  const message = (data.message as Record<string, unknown>) || data;
  return {
    status: String(message.status || "").toLowerCase(),
    error: message.error ? String(message.error) : null,
  };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Send SMS through GHL Conversations (FMS sendLeadSms shape). */
export async function sendGhlSms(opts: {
  phoneE164: string;
  body: string;
  contactName?: string;
}): Promise<{ messageId: string | null; contactId: string; conversationId: string | null }> {
  const message = String(opts.body || "").trim();
  if (!message) {
    throw new Error("SMS body is required");
  }
  if (message.length > 1600) {
    throw new Error("Message is too long (max 1600 characters)");
  }

  const contactId = await ensureGhlContactId({
    phoneE164: opts.phoneE164,
    name: opts.contactName,
  });

  await clearGhlSmsDnd(contactId);

  const payload: Record<string, string> = {
    type: "SMS",
    contactId,
    message,
    toNumber: opts.phoneE164,
  };

  let result: Record<string, unknown>;
  try {
    result = await ghlRequest("/conversations/messages", {
      method: "POST",
      body: payload,
      timeoutMs: 20000,
    });
  } catch (e) {
    const msg = String((e as Error).message || "");
    // Retry once after clearing DND if GHL still had it on
    if (/DND is active/i.test(msg)) {
      await clearGhlSmsDnd(contactId);
      result = await ghlRequest("/conversations/messages", {
        method: "POST",
        body: payload,
        timeoutMs: 20000,
      });
    } else {
      throw e;
    }
  }

  const messageId = result.messageId ? String(result.messageId) : null;

  // GHL often accepts the POST then fails delivery async (e.g. country block).
  if (messageId) {
    for (let i = 0; i < 4; i++) {
      await sleep(700);
      try {
        const st = await getGhlMessageStatus(messageId);
        if (st.status === "failed" || st.status === "undelivered") {
          throw new Error(
            st.error ||
              `GHL SMS delivery failed (status=${st.status}). Check destination country permissions.`
          );
        }
        if (
          st.status === "delivered" ||
          st.status === "completed" ||
          st.status === "sent" ||
          st.status === "read"
        ) {
          break;
        }
      } catch (e) {
        if ((e as Error).message?.includes("GHL SMS delivery failed") ||
            (e as Error).message?.includes("not allowed to send SMS")) {
          throw e;
        }
        // ignore transient status fetch errors
      }
    }
  }

  return {
    contactId,
    conversationId: result.conversationId
      ? String(result.conversationId)
      : null,
    messageId,
  };
}
