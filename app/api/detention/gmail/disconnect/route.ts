import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { isAdminRole } from "@/lib/roles";
import {
  clearDetentionGmailTokens,
  isValidDetentionGmailSetupKey,
} from "@/lib/detention/gmailOAuth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  const key =
    request.nextUrl.searchParams.get("key") ||
    request.headers.get("x-detention-gmail-setup-key") ||
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

  await clearDetentionGmailTokens();
  return NextResponse.json({ ok: true });
}
