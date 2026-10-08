import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { isAdminRole } from "@/lib/roles";
import {
  buildGoogleAuthUrl,
  createOAuthState,
  detentionGmailOAuthConfigured,
  isValidDetentionGmailSetupKey,
} from "@/lib/detention/gmailOAuth";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "detention_gmail_oauth_state";
const SETUP_COOKIE = "detention_gmail_setup";

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  const key =
    request.nextUrl.searchParams.get("key") ||
    request.cookies.get(SETUP_COOKIE)?.value ||
    "";
  const setupOk = isValidDetentionGmailSetupKey(key);

  if (!user && !setupOk) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }
  if (user && !isAdminRole(user.role) && !setupOk) {
    return NextResponse.json(
      { ok: false, error: "Forbidden" },
      { status: 403 }
    );
  }

  if (!detentionGmailOAuthConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Google OAuth is not configured yet on the server (Client ID / Secret missing). IT must create the Google Cloud OAuth client first.",
      },
      { status: 503 }
    );
  }

  const state = createOAuthState();
  const url = buildGoogleAuthUrl(state);
  const res = NextResponse.redirect(url);
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 20,
  });
  if (setupOk) {
    res.cookies.set(SETUP_COOKIE, key, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60,
    });
  }
  if (user) {
    res.cookies.set(
      "detention_gmail_connected_by",
      user.username || `user-${user.id}`,
      {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 20,
      }
    );
  }
  return res;
}
