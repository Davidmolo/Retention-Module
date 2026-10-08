import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { sendAppEmail } from "@/lib/mail";
import {
  canAccessModule,
  type AppModule,
} from "@/lib/roles";

export const dynamic = "force-dynamic";

const FEEDBACK_MODULES = ["gross-profit", "retention", "detention"] as const;
type FeedbackModule = (typeof FEEDBACK_MODULES)[number] | "overall";

const MODULE_LABELS: Record<FeedbackModule, string> = {
  "gross-profit": "Gross Profit",
  retention: "Retention",
  detention: "Detention",
  overall: "Website overall",
};

function parseEmailList(raw: string): string[] {
  return raw
    .split(/[,;\s]+/)
    .map((e) => e.trim())
    .filter((e) => e.includes("@"));
}

function feedbackRecipients() {
  const to = parseEmailList(
    process.env.FEEDBACK_TO ||
      "shahmeer@azfsllc.com,maaz@azfsllc.com"
  );
  const cc = parseEmailList(
    process.env.FEEDBACK_CC || "mantas@goxxii.com"
  );
  return { to, cc };
}

function isFeedbackModule(value: string): value is FeedbackModule {
  return (
    value === "overall" ||
    (FEEDBACK_MODULES as readonly string[]).includes(value)
  );
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized — please sign in again" },
      { status: 401 }
    );
  }

  let body: { module?: string; message?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const moduleRaw = String(body.module || "").trim();
  const message = String(body.message || "").trim();

  if (!isFeedbackModule(moduleRaw)) {
    return NextResponse.json(
      { ok: false, error: "Select a valid module or website overall" },
      { status: 400 }
    );
  }

  if (moduleRaw !== "overall") {
    if (!canAccessModule(user.modules, moduleRaw as AppModule)) {
      return NextResponse.json(
        {
          ok: false,
          error: "You can only leave feedback for modules you can access",
        },
        { status: 403 }
      );
    }
  }

  if (message.length < 5) {
    return NextResponse.json(
      { ok: false, error: "Please write a bit more detail (at least a few words)" },
      { status: 400 }
    );
  }
  if (message.length > 5000) {
    return NextResponse.json(
      { ok: false, error: "Feedback is too long (max 5000 characters)" },
      { status: 400 }
    );
  }

  const { to, cc } = feedbackRecipients();
  if (!to.length) {
    return NextResponse.json(
      { ok: false, error: "Feedback recipients are not configured" },
      { status: 500 }
    );
  }

  const about = MODULE_LABELS[moduleRaw];
  const who =
    user.displayName?.trim() ||
    user.username ||
    `user #${user.id}`;
  const subject = `[XXII Feedback] ${about} — ${who}`;
  const text = [
    `XXII website feedback`,
    ``,
    `About: ${about}`,
    `From: ${who}`,
    `Username: ${user.username}`,
    `Role: ${user.role}`,
    `Modules: ${user.modules.join(", ") || "(none)"}`,
    `Sent: ${new Date().toISOString()}`,
    ``,
    `Message:`,
    message,
  ].join("\n");

  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#0f172a;line-height:1.5">
      <h2 style="margin:0 0 12px;font-size:18px">XXII website feedback</h2>
      <table style="border-collapse:collapse;margin-bottom:16px">
        <tr><td style="padding:4px 12px 4px 0;color:#64748b">About</td><td><strong>${escapeHtml(about)}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#64748b">From</td><td>${escapeHtml(who)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#64748b">Username</td><td>${escapeHtml(user.username)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#64748b">Role</td><td>${escapeHtml(user.role)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#64748b">Modules</td><td>${escapeHtml(user.modules.join(", ") || "(none)")}</td></tr>
      </table>
      <div style="white-space:pre-wrap;border:1px solid #e2e8f0;border-radius:8px;padding:12px;background:#f8fafc">${escapeHtml(message)}</div>
    </div>
  `;

  const replyTo = user.username.includes("@") ? user.username : undefined;
  const result = await sendAppEmail({
    to,
    cc,
    subject,
    text,
    html,
    replyTo,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error || "Failed to send feedback" },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    data: { mocked: result.mocked },
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
