import { fail, ok } from "@/lib/http";
import { listActiveDriversForComms } from "@/lib/driverComms/smsLog";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") || "";
    // Wider limit while searching so matches aren't capped out of the inbox slice.
    const drivers = await listActiveDriversForComms({
      q,
      limit: q.trim() ? 500 : 300,
    });
    return ok({ drivers });
  } catch (error) {
    return fail(error);
  }
}
