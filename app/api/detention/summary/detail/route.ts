import { fail, ok } from "@/lib/http";
import {
  getDispatcherRateTrend,
  listDetentionPeriodClaims,
  type DetentionSummaryFilters,
} from "@/lib/detention/summary";

export const dynamic = "force-dynamic";

function parseFilters(searchParams: URLSearchParams): DetentionSummaryFilters {
  const daysRaw = searchParams.get("days");
  const days =
    daysRaw == null || daysRaw === ""
      ? 90
      : Math.max(0, Math.floor(Number(daysRaw)) || 0);
  const status = searchParams.get("status") || undefined;
  const dispatcher = searchParams.get("dispatcher") || undefined;
  const emailDate = searchParams.get("emailDate") || undefined;
  return { days, status, dispatcher, emailDate };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const kind = searchParams.get("kind");
    const key = searchParams.get("key") || "";
    const filters = parseFilters(searchParams);
    if (kind === "week" || kind === "month") {
      return ok({ claims: await listDetentionPeriodClaims(kind, key, filters) });
    }
    if (kind === "dispatcher") {
      return ok(await getDispatcherRateTrend(key, filters));
    }
    const err = new Error("Unknown summary detail");
    (err as Error & { status?: number }).status = 400;
    throw err;
  } catch (error) {
    return fail(error);
  }
}
