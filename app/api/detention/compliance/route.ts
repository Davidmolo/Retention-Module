import { fail, ok } from "@/lib/http";
import { getDetentionComplianceByDispatcher } from "@/lib/detention/summary";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const groups = await getDetentionComplianceByDispatcher();
    return ok({ groups });
  } catch (error) {
    return fail(error);
  }
}
