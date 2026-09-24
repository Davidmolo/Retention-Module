/**
 * Google Chat celebration posts for Retention (XXII Century).
 * TEAM Shout-Outs Incoming Webhook — not AZFS/FMS Chat webhooks.
 * Set GOOGLE_CHAT_RETENTION_CELEBRATE_WEBHOOK_URL.
 * No-ops when unset. Failures are logged — never thrown to survey submit.
 */

export type GoogleChatResult = {
  sent: boolean;
  skipped?: boolean;
  failed?: boolean;
  reason?: string;
  error?: string;
};

function getCelebrateWebhookUrl(): string {
  return (
    process.env.GOOGLE_CHAT_RETENTION_CELEBRATE_WEBHOOK_URL?.trim() ||
    process.env.GOOGLE_CHAT_WEBHOOK_URL?.trim() ||
    ""
  );
}

export function isCelebrateChatConfigured(): boolean {
  return Boolean(getCelebrateWebhookUrl());
}

export function buildPositiveSurveyCelebrateText(opts: {
  driverName: string;
  driverId: string;
  overallRating: number;
  generalComment?: string;
  dispatcher?: string;
}): string {
  const stars = "★".repeat(opts.overallRating) + "☆".repeat(5 - opts.overallRating);
  const comment = String(opts.generalComment || "").trim();
  const lines = [
    `*Driver celebration — ${opts.overallRating}/5* ${stars}`,
    `*Driver:* ${opts.driverName} (ID ${opts.driverId})`,
  ];
  if (opts.dispatcher && opts.dispatcher !== "Unassigned") {
    lines.push(`*Dispatcher:* ${opts.dispatcher}`);
  }
  if (comment) {
    lines.push(`*Comment:* ${comment}`);
  }
  lines.push("");
  lines.push(
    "Let's celebrate — great feedback from the road. Keep supporting this driver!"
  );
  return lines.join("\n");
}

async function postGoogleChatWebhook(
  webhookUrl: string,
  text: string
): Promise<void> {
  const timeoutMs = Math.max(
    2000,
    Number(process.env.GOOGLE_CHAT_WEBHOOK_TIMEOUT_MS) || 10000
  );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
    const bodyText = await res.text().catch(() => "");
    if (!res.ok) {
      throw new Error(
        `Google Chat webhook failed (${res.status})${bodyText ? `: ${bodyText}` : ""}`
      );
    }
  } finally {
    clearTimeout(timer);
  }
}

/** Post celebration to Workspace Chat when a driver rates 4–5. */
export async function notifyPositiveSurveyToGoogleChat(opts: {
  driverName: string;
  driverId: string;
  overallRating: number;
  generalComment?: string;
  dispatcher?: string;
}): Promise<GoogleChatResult> {
  const webhookUrl = getCelebrateWebhookUrl();
  if (!webhookUrl) {
    console.log(
      "[google-chat:skip] GOOGLE_CHAT_RETENTION_CELEBRATE_WEBHOOK_URL not set"
    );
    return { sent: false, skipped: true, reason: "webhook_not_configured" };
  }

  const text = buildPositiveSurveyCelebrateText(opts);
  try {
    await postGoogleChatWebhook(webhookUrl, text);
    console.log("[google-chat:celebrate]", {
      driverId: opts.driverId,
      rating: opts.overallRating,
    });
    return { sent: true };
  } catch (e) {
    console.error("[google-chat:celebrate]", (e as Error).message);
    return {
      sent: false,
      failed: true,
      error: (e as Error).message,
    };
  }
}
