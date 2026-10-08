import { fail, ok } from "@/lib/http";
import {
  getDetentionKpis,
  listDetentionDispatchers,
  listDetentions,
  type DetentionSort,
} from "@/lib/detention/store";
import { DETENTION_STATUSES } from "@/lib/detention/types";

export const dynamic = "force-dynamic";

function parseSort(raw: string | null): DetentionSort | undefined {
  if (
    raw === "default" ||
    raw === "emailDateDesc" ||
    raw === "emailDateAsc"
  ) {
    return raw;
  }
  return undefined;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || undefined;
    const search = searchParams.get("search") || undefined;
    const dispatcher = searchParams.get("dispatcher") || undefined;
    const emailDate = searchParams.get("emailDate") || undefined;
    const sort = parseSort(searchParams.get("sort"));
    const awaitingUs = searchParams.get("awaitingUs") === "1";
    const followUpDue = searchParams.get("followUpDue") === "1";
    const page = Number(searchParams.get("page") || "1") || 1;
    const pageSize = Number(searchParams.get("pageSize") || "25") || 25;
    const daysRaw = searchParams.get("days");
    const days =
      daysRaw != null && daysRaw !== ""
        ? Number(daysRaw)
        : undefined;

    const [list, kpis, dispatchers] = await Promise.all([
      listDetentions({
        status,
        search,
        dispatcher,
        awaitingUs,
        followUpDue,
        emailDate,
        days,
        sort,
        page,
        pageSize,
      }),
      getDetentionKpis(),
      listDetentionDispatchers(),
    ]);

    return ok({
      items: list.items,
      total: list.total,
      page: list.page,
      pageSize: list.pageSize,
      totalPages: list.totalPages,
      kpis,
      statuses: DETENTION_STATUSES,
      dispatchers,
    });
  } catch (error) {
    return fail(error);
  }
}
