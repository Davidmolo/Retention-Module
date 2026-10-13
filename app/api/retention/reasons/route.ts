import { fail, ok } from "@/lib/http";
import { getReasonsSummary } from "@/lib/retention/reasons";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok(await getReasonsSummary());
  } catch (error) {
    return fail(error);
  }
}
