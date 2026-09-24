/**
 * Retention SMS sender.
 *
 * IMPORTANT: XXII Century and AZFS are separate companies.
 * Retention (XXII Century) must use XXII Century GHL location credentials —
 * do NOT reuse AZFS/FMS GHL keys.
 *
 * Providers (RETENTION_SMS_PROVIDER):
 *   - ghl     → GoHighLevel Conversations SMS (XXII Century location)
 *   - twilio  → Twilio REST (optional fallback)
 *   - auto    → GHL if configured, else Twilio, else mock (default)
 *
 * GHL (XXII Century): GHL_LOCATION_ID, GHL_PRIVATE_INTEGRATION_KEY, GHL_API_VERSION
 * Twilio (optional): TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_PHONE
 */

import {
  isGhlSmsConfigured,
  sendGhlSms,
} from "./ghlSms";

export type SmsSendResult = {
  ok: boolean;
  mocked: boolean;
  provider: "ghl" | "twilio" | "mock";
  providerMessageId: string | null;
  error?: string;
};

export type SmsSendOptions = {
  /** Used when creating a new GHL contact for this phone. */
  contactName?: string;
};

function envFirst(...keys: string[]): string {
  for (const k of keys) {
    const v = process.env[k]?.trim();
    if (v) return v;
  }
  return "";
}

/** Same rules as FMS utils/phoneNormalize.js */
export function normalizePhoneE164(raw: string): string {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (trimmed.startsWith("+")) return `+${digits}`;
  return `+${digits}`;
}

export function isTwilioConfigured(): boolean {
  const sid = envFirst("TWILIO_ACCOUNT_SID");
  const token = envFirst("TWILIO_AUTH_TOKEN");
  const from = envFirst(
    "TWILIO_FROM_PHONE",
    "TWILIO_PHONE_NUMBER",
    "TWILIO_FROM_NUMBER"
  );
  return Boolean(sid && token && from);
}

function resolveProvider(): "ghl" | "twilio" | "mock" {
  const raw = (process.env.RETENTION_SMS_PROVIDER || "auto").toLowerCase().trim();
  if (raw === "ghl") return isGhlSmsConfigured() ? "ghl" : "mock";
  if (raw === "twilio") return isTwilioConfigured() ? "twilio" : "mock";
  // auto
  if (isGhlSmsConfigured()) return "ghl";
  if (isTwilioConfigured()) return "twilio";
  return "mock";
}

async function sendViaTwilio(
  dest: string,
  body: string
): Promise<SmsSendResult> {
  const sid = envFirst("TWILIO_ACCOUNT_SID");
  const token = envFirst("TWILIO_AUTH_TOKEN");
  const from = envFirst(
    "TWILIO_FROM_PHONE",
    "TWILIO_PHONE_NUMBER",
    "TWILIO_FROM_NUMBER"
  );

  try {
    const auth = Buffer.from(`${sid}:${token}`).toString("base64");
    const params = new URLSearchParams({
      To: dest,
      From: from,
      Body: String(body || "").trim(),
    });
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      }
    );
    const json = (await res.json()) as { sid?: string; message?: string };
    if (!res.ok) {
      console.error("[sms:twilio]", res.status, json);
      return {
        ok: false,
        mocked: false,
        provider: "twilio",
        providerMessageId: null,
        error: json.message || `Twilio ${res.status}`,
      };
    }
    console.log("[sms:twilio]", { to: dest, sid: json.sid });
    return {
      ok: true,
      mocked: false,
      provider: "twilio",
      providerMessageId: json.sid || null,
    };
  } catch (e) {
    console.error("[sms:twilio]", (e as Error).message);
    return {
      ok: false,
      mocked: false,
      provider: "twilio",
      providerMessageId: null,
      error: (e as Error).message,
    };
  }
}

async function sendViaGhl(
  dest: string,
  body: string,
  opts?: SmsSendOptions
): Promise<SmsSendResult> {
  try {
    const out = await sendGhlSms({
      phoneE164: dest,
      body,
      contactName: opts?.contactName,
    });
    console.log("[sms:ghl]", {
      to: dest,
      messageId: out.messageId,
      contactId: out.contactId,
    });
    return {
      ok: true,
      mocked: false,
      provider: "ghl",
      providerMessageId: out.messageId,
    };
  } catch (e) {
    console.error("[sms:ghl]", (e as Error).message);
    return {
      ok: false,
      mocked: false,
      provider: "ghl",
      providerMessageId: null,
      error: (e as Error).message,
    };
  }
}

export async function sendSms(
  to: string,
  body: string,
  opts?: SmsSendOptions
): Promise<SmsSendResult> {
  const dest = normalizePhoneE164(to);
  const provider = resolveProvider();

  if (provider === "mock") {
    console.log("[sms:mock]", { to: dest, body, providerHint: "ghl|twilio not configured" });
    return {
      ok: true,
      mocked: true,
      provider: "mock",
      providerMessageId: `mock-${Date.now()}`,
    };
  }

  if (!dest) {
    return {
      ok: false,
      mocked: false,
      provider,
      providerMessageId: null,
      error: "A valid driver phone number is required to send SMS.",
    };
  }

  if (provider === "ghl") {
    return sendViaGhl(dest, body, opts);
  }
  return sendViaTwilio(dest, body);
}
