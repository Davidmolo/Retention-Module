import { fail, ok } from "@/lib/http";
import {
  getDetentionDispatcherSummary,
  getDetentionMonthlySummary,
  getDetentionWeeklySummary,
} from "@/lib/detention/summary";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [weeks, months, dispatchers] = await Promise.all([
      getDetentionWeeklySummary(26),
      getDetentionMonthlySummary(18),
      getDetentionDispatcherSummary(),
    ]);
    return ok({ weeks, months, dispatchers });
  } catch (error) {
    return fail(error);
  }
}
