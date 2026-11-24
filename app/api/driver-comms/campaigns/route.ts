import { getAuthUser } from "@/lib/auth";
import { createCampaign, listCampaigns } from "@/lib/driverComms/campaigns";
import { fail, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) {
      const err = new Error("Unauthorized");
      (err as Error & { status?: number }).status = 401;
      throw err;
    }
    return ok({ campaigns: await listCampaigns() });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) {
      const err = new Error("Unauthorized");
      (err as Error & { status?: number }).status = 401;
      throw err;
    }
    const body = (await request.json().catch(() => ({}))) as {
      title?: string;
      text?: string;
      driverIds?: string[];
    };
    const created = await createCampaign({
      title: String(body.title || ""),
      body: String(body.text || ""),
      userId: user.id,
      userName: user.displayName || user.username,
      username: user.username,
      driverIds: Array.isArray(body.driverIds) ? body.driverIds : null,
    });
    return ok(created);
  } catch (error) {
    return fail(error);
  }
}
