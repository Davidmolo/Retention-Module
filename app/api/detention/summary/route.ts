import { fail, ok } from "@/lib/http";
import {
  getDetentionCustomersBilled,
  getDetentionDispatcherSummary,
  getDetentionMonthlySummary,
  getDetentionWeeklySummary,
  listDetentionSummaryCustomers,
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
  const customer = searchParams.get("customer") || undefined;
  const paidRaw = searchParams.get("paid");
  const paid =
    paidRaw === "paid" || paidRaw === "unpaid" ? paidRaw : undefined;
  const emailDate = searchParams.get("emailDate") || undefined;
  return { days, status, dispatcher, customer, paid, emailDate };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const filters = parseFilters(searchParams);
    const [weeks, months, dispatchers, customers, dispatcherOptions, customerOptions] =
      await Promise.all([
      getDetentionWeeklySummary(26, filters),
      getDetentionMonthlySummary(18, filters),
      getDetentionDispatcherSummary(filters),
      getDetentionCustomersBilled(filters),
      listDetentionSummaryDispatchers(),
      listDetentionSummaryCustomers(),
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
        customers: customerOptions,
      },
    });
  } catch (error) {
    return fail(error);
  }
}
