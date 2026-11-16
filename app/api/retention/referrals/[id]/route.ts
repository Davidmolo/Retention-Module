import { setReferralStatus } from "@/lib/retention/service";
import { fail, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    return ok(await setReferralStatus(id, String(body.status || "")));
  } catch (error) {
    return fail(error);
  }
}
