import { NextRequest, NextResponse } from "next/server";
import {
  detentionGmailExpectedEmail,
  exchangeCodeForTokens,
  fetchGoogleAccountEmail,
  saveDetentionGmailTokens,
} from "@/lib/detention/gmailOAuth";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "detention_gmail_oauth_state";
const BY_COOKIE = "detention_gmail_connected_by";

function appBase(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") ||
    "https://v2.goxxii.com"
  );
}

function redirectWith(query: Record<string, string>) {
  const u = new URL(`${appBase()}/detention/connect-ar-mailbox`);
  for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v);
  return NextResponse.redirect(u.toString());
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const error = searchParams.get("error");
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const expectedState = request.cookies.get(STATE_COOKIE)?.value;

  if (error) {
    const res = redirectWith({
      status: "error",
      message: error,
    });
    res.cookies.delete(STATE_COOKIE);
    return res;
  }

  if (!code || !state || !expectedState || state !== expectedState) {
    const res = redirectWith({
      status: "error",
      message: "Invalid or expired Google connect session. Please try again.",
    });
    res.cookies.delete(STATE_COOKIE);
    return res;
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const email = await fetchGoogleAccountEmail(tokens.accessToken);
    const expected = detentionGmailExpectedEmail();
    if (email !== expected) {
      const res = redirectWith({
        status: "error",
        message: `Wrong Google account. Connected ${email}, but we need ${expected}. Sign out of Google and try again with ${expected}.`,
      });
      res.cookies.delete(STATE_COOKIE);
      return res;
    }

    const connectedBy =
      request.cookies.get(BY_COOKIE)?.value || "setup-link";

    await saveDetentionGmailTokens({
      email,
      refreshToken: tokens.refreshToken,
      accessToken: tokens.accessToken,
      expiresAt: tokens.expiresAt,
      scope: tokens.scope,
      connectedBy,
    });

    const res = redirectWith({
      status: "connected",
      email,
    });
    res.cookies.delete(STATE_COOKIE);
    res.cookies.delete(BY_COOKIE);
    return res;
  } catch (e) {
    const res = redirectWith({
      status: "error",
      message: (e as Error).message || "Connect failed",
    });
    res.cookies.delete(STATE_COOKIE);
    return res;
  }
}
