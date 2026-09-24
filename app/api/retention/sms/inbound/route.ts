import { retentionStore } from "@/lib/retention/store";
import { normalizePhoneE164 } from "@/lib/retention/sms";
import { ok } from "@/lib/http";

export const dynamic = "force-dynamic";

const OPT_OUT_WORDS = new Set([
  "stop",
  "stopall",
  "unsubscribe",
  "cancel",
  "end",
  "quit",
]);
const OPT_IN_WORDS = new Set(["start", "unstop", "yes"]);

function normalizeKeyword(body: string): string {
  return String(body || "")
    .trim()
    .split(/\s+/)[0]
    ?.toLowerCase()
    .replace(/[^a-z]/g, "") || "";
}

function pickPhone(payload: Record<string, unknown>): string {
  const candidates = [
    payload.From,
    payload.from,
    payload.phone,
    payload.Phone,
    payload.contactPhone,
    payload.phoneNumber,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  const contact = payload.contact;
  if (contact && typeof contact === "object") {
    const o = contact as Record<string, unknown>;
    for (const c of [o.phone, o.Phone, o.phoneNumber]) {
      if (typeof c === "string" && c.trim()) return c.trim();
    }
  }
  return "";
}

function pickBody(payload: Record<string, unknown>): string {
  const candidates = [
    payload.Body,
    payload.body,
    payload.message,
    payload.Message,
    payload.text,
    payload.Text,
  ];
  for (const c of candidates) {
    if (typeof c === "string") return c;
  }
  return "";
}

async function parsePayload(req: Request): Promise<Record<string, unknown>> {
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return (await req.json().catch(() => ({}))) as Record<string, unknown>;
  }
  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const form = await req.formData();
    const out: Record<string, unknown> = {};
    form.forEach((value, key) => {
      out[key] = typeof value === "string" ? value : String(value);
    });
    return out;
  }
  const text = await req.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    const params = new URLSearchParams(text);
    const out: Record<string, unknown> = {};
    params.forEach((value, key) => {
      out[key] = value;
    });
    return out;
  }
}

function assertWebhookSecret(req: Request) {
  const expected = process.env.RETENTION_SMS_WEBHOOK_SECRET?.trim();
  if (!expected) return;
  const got =
    req.headers.get("x-retention-webhook-secret") ||
    req.headers.get("x-webhook-secret") ||
    "";
  if (got !== expected) {
    const err = new Error("Unauthorized webhook");
    (err as Error & { status?: number }).status = 401;
    throw err;
  }
}

/**
 * Inbound SMS webhook (Twilio form posts + GHL/JSON payloads).
 * STOP / STOPALL / UNSUBSCRIBE / CANCEL / END / QUIT → opt out.
 * START / UNSTOP / YES → opt back in.
 *
 * Configure provider callback URL to: POST /api/retention/sms/inbound
 * Optional: RETENTION_SMS_WEBHOOK_SECRET header x-retention-webhook-secret
 */
export async function POST(req: Request) {
  try {
    assertWebhookSecret(req);
    const payload = await parsePayload(req);
    const phoneRaw = pickPhone(payload);
    const body = pickBody(payload);
    const keyword = normalizeKeyword(body);
    const phone = normalizePhoneE164(phoneRaw) || phoneRaw.trim();

    if (!phone) {
      return ok({ handled: false, reason: "missing_phone" });
    }

    if (OPT_OUT_WORDS.has(keyword)) {
      const row = await retentionStore.setOptOut(phone, true, "inbound_sms");
      return ok({
        handled: true,
        action: "opt_out",
        phone: row.phone,
        keyword,
      });
    }

    if (OPT_IN_WORDS.has(keyword)) {
      const row = await retentionStore.setOptOut(phone, false, "inbound_sms");
      return ok({
        handled: true,
        action: "opt_in",
        phone: row.phone,
        keyword,
      });
    }

    return ok({ handled: false, reason: "ignored", keyword: keyword || null });
  } catch (error) {
    const status = (error as Error & { status?: number }).status || 500;
    return Response.json(
      { ok: false, error: (error as Error).message },
      { status }
    );
  }
}
