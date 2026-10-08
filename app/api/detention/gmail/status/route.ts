import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { isAdminRole } from "@/lib/roles";
import {
  detentionGmailOAuthConfigured,
  getDetentionGmailConnection,
  isValidDetentionGmailSetupKey,
} from "@/lib/detention/gmailOAuth";

export const dynamic = "force-dynamic";

function canManage(request: NextRequest) {
  const setupKey =
    request.nextUrl.searchParams.get("key") ||
    request.headers.get("x-detention-gmail-setup-key");
  if (isValidDetentionGmailSetupKey(setupKey)) return true;
  return false;
}

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  const setupOk = canManage(request);
  if (!user && !setupOk) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }
  if (user && !isAdminRole(user.role) && !setupOk) {
    return NextResponse.json(
      { ok: false, error: "Only Admin / Super Admin (or IT setup link) can manage mailbox connect" },
      { status: 403 }
    );
  }

  const connection = await getDetentionGmailConnection();
  return NextResponse.json({
    ok: true,
    data: {
      ...connection,
      oauthConfigured: detentionGmailOAuthConfigured(),
    },
  });
}
