import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { canAccessModule, isAdminRole } from "@/lib/roles";
import { isValidDetentionGmailSetupKey } from "@/lib/detention/gmailOAuth";
import { runDetentionEmailIntake } from "@/lib/detention/intake";

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
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }
  // Logged-in Detention users can sync inbox; cron uses setup key.
  if (
    user &&
    !isAdminRole(user.role) &&
    !setupOk &&
    !canAccessModule(user.modules, "detention")
  ) {
    return NextResponse.json(
      { ok: false, error: "Forbidden" },
      { status: 403 }
    );
  }

  let lookbackDays: number | undefined;
  try {
    const body = await request.json().catch(() => ({}));
    if (body?.lookbackDays) lookbackDays = Number(body.lookbackDays);
  } catch {
    /* no body */
  }

  const result = await runDetentionEmailIntake({ lookbackDays });
  return NextResponse.json({ ok: result.ok || result.errors === 0, data: result });
}
