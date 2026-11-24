import { getSurveyVolume } from "@/lib/retention/service";
import { fail, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const kind = searchParams.get("kind") === "month" ? "month" : "week";
    const key = searchParams.get("key") || undefined;
    return ok(await getSurveyVolume(kind, key));
  } catch (error) {
    return fail(error);
  }
}
