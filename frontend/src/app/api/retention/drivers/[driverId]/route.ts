import { getDriverDetail } from "@/lib/retention/service";
import { fail, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ driverId: string }> }
) {
  try {
    const { driverId } = await params;
    return ok(await getDriverDetail(driverId));
  } catch (error) {
    return fail(error);
  }
}
