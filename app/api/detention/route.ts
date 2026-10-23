import { fail, ok } from "@/lib/http";
import { getAuthUser } from "@/lib/auth";
import { canAccessModule, isAdminRole } from "@/lib/roles";
import {
  createManualDetention,
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

function todayYmd(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.APP_TIMEZONE || "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function POST(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) {
      const err = new Error("Unauthorized");
      (err as Error & { status?: number }).status = 401;
      throw err;
    }
    if (
      !isAdminRole(user.role) &&
      !canAccessModule(user.modules, "detention")
    ) {
      const err = new Error("Forbidden");
      (err as Error & { status?: number }).status = 403;
      throw err;
    }

    const body = (await request.json().catch(() => ({}))) as {
      customer?: string;
      dispatcher?: string;
      loadNumber?: string;
      driverName?: string;
      puLocation?: string;
      puAppt?: string;
      delLocation?: string;
      emailDate?: string;
      timeLabel?: string;
      amount?: number | string;
    };
    const amount = Number(body.amount);
    const created = await createManualDetention({
      customer: String(body.customer || ""),
      dispatcher: String(body.dispatcher || ""),
      loadNumber: String(body.loadNumber || ""),
      driverName: String(body.driverName || ""),
      puLocation: body.puLocation,
      puAppt: body.puAppt,
      delLocation: body.delLocation,
      emailDate: String(body.emailDate || todayYmd()),
      timeLabel: body.timeLabel,
      amount,
      actor: user.displayName || user.username,
    });
    return ok({ detention: created });
  } catch (error) {
    return fail(error);
  }
}
