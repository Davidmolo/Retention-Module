import { getOverview } from "@/lib/retention/service";
import { fail, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok(await getOverview());
  } catch (error) {
    return fail(error);
  }
}
