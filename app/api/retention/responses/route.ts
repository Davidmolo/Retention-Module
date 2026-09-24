import { getResponsesPage } from "@/lib/retention/service";
import { fail, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Number(searchParams.get("page") || "1");
    const pageSize = Number(searchParams.get("pageSize") || "20");
    const filterRaw = searchParams.get("filter");
    const filter =
      filterRaw === "pending" ||
      filterRaw === "completed" ||
      filterRaw === "non_response"
        ? filterRaw
        : "all";
    const q = searchParams.get("q") || "";

    const data = await getResponsesPage({ page, pageSize, filter, q });
    return ok(data);
  } catch (error) {
    return fail(error);
  }
}
