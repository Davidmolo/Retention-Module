import { fail, ok } from "@/lib/http";
import { getResponsesInsights } from "@/lib/retention/insights";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month") || null;
    const data = await getResponsesInsights({ month });
    return ok(data);
  } catch (error) {
    return fail(error);
  }
}
