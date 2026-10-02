import { fail, ok } from "@/lib/http";
import { getDetentionKpis, listDetentions } from "@/lib/detention/store";
import { DETENTION_STATUSES } from "@/lib/detention/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || undefined;
    const search = searchParams.get("search") || undefined;
    const awaitingUs = searchParams.get("awaitingUs") === "1";
    const followUpDue = searchParams.get("followUpDue") === "1";

    const [items, kpis] = await Promise.all([
      listDetentions({ status, search, awaitingUs, followUpDue }),
      getDetentionKpis(),
    ]);

    return ok({
      items,
      kpis,
      statuses: DETENTION_STATUSES,
    });
  } catch (error) {
    return fail(error);
  }
}
