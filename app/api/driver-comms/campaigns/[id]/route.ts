import { getAuthUser } from "@/lib/auth";
import { getCampaign } from "@/lib/driverComms/campaigns";
import { fail, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) {
      const err = new Error("Unauthorized");
      (err as Error & { status?: number }).status = 401;
      throw err;
    }
    const { id } = await ctx.params;
    const campaign = await getCampaign(id, user.id);
    if (!campaign) {
      const err = new Error("Campaign not found");
      (err as Error & { status?: number }).status = 404;
      throw err;
    }
    return ok({ campaign });
  } catch (error) {
    return fail(error);
  }
}
