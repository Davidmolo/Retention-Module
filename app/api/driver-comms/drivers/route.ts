import { fail, ok } from "@/lib/http";
import { listActiveDriversForComms } from "@/lib/driverComms/smsLog";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") || "";
    const drivers = await listActiveDriversForComms({ q, limit: 300 });
    return ok({ drivers });
  } catch (error) {
    return fail(error);
  }
}
