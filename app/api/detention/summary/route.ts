import { fail, ok } from "@/lib/http";
import {
  getDetentionCustomersBilled,
  getDetentionDispatcherSummary,
  getDetentionMonthlySummary,
  getDetentionWeeklySummary,
  listDetentionSummaryDispatchers,
  type DetentionSummaryFilters,
} from "@/lib/detention/summary";
import { DETENTION_STATUSES } from "@/lib/detention/types";

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
    const filters = parseFilters(searchParams);
    const [weeks, months, dispatchers, customers, dispatcherOptions] =
      await Promise.all([
      getDetentionWeeklySummary(26, filters),
      getDetentionMonthlySummary(18, filters),
      getDetentionDispatcherSummary(filters),
      getDetentionCustomersBilled(filters),
      listDetentionSummaryDispatchers(),
    ]);
    return ok({
      weeks,
      months,
      dispatchers,
      customers,
      filters,
      filterOptions: {
        statuses: [...DETENTION_STATUSES],
        dispatchers: dispatcherOptions,
      },
    });
  } catch (error) {
    return fail(error);
  }
}
