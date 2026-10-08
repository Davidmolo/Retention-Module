import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { isAdminRole } from "@/lib/roles";
import { isValidDetentionGmailSetupKey } from "@/lib/detention/gmailOAuth";
import { runDetentionComplianceScan } from "@/lib/detention/replyScan";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  const key =
    request.nextUrl.searchParams.get("key") ||
    request.headers.get("x-detention-gmail-setup-key") ||
    "";
  const setupOk = isValidDetentionGmailSetupKey(key);
  if (!user && !setupOk) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (user && !isAdminRole(user.role) && !setupOk) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const result = await runDetentionComplianceScan();
  return NextResponse.json({ ok: true, data: result });
}
