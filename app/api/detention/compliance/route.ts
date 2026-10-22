import { fail, ok } from "@/lib/http";
import {
  getArComplianceGroup,
  getDetentionComplianceByDispatcher,
  getDetentionComplianceTrajectory,
} from "@/lib/detention/summary";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [groups, ar, weeks] = await Promise.all([
      getDetentionComplianceByDispatcher(),
      getArComplianceGroup(),
      getDetentionComplianceTrajectory(),
    ]);
    return ok({ groups, ar, weeks });
  } catch (error) {
    return fail(error);
  }
}
