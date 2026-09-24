import { getSurveySession } from "@/lib/retention/service";
import { fail, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    return ok(await getSurveySession(token));
  } catch (error) {
    return fail(error);
  }
}
