import { fail, ok } from "@/lib/http";
import { getDetentionAnalytics } from "@/lib/detention/analytics";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const days = Math.max(0, Number(searchParams.get("days") || "90") || 90);
    const data = await getDetentionAnalytics(days);
    return ok(data);
  } catch (error) {
    return fail(error);
  }
}
