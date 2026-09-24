import { updateCaseStatus } from "@/lib/retention/service";
import type { CaseStatus } from "@/lib/retention/types";
import { fail, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ caseId: string }> }
) {
  try {
    const { caseId } = await params;
    const body = await req.json();
    return ok(await updateCaseStatus(caseId, body.status as CaseStatus));
  } catch (error) {
    return fail(error);
  }
}
