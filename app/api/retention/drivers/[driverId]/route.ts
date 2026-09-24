import { getDriverDetail } from "@/lib/retention/service";
import { fail, ok } from "@/lib/http";
import { CACHE_KEYS, cacheGet, cacheSet } from "@/lib/cache";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ driverId: string }> }
) {
  try {
    const { driverId } = await params;
    const key = CACHE_KEYS.retentionDriver(driverId);
    const cached = await cacheGet<unknown>(key);
    if (cached) return ok(cached);

    const data = await getDriverDetail(driverId);
    // Don't cache empty GP averages forever — report generation may fill them soon.
    const hasGp =
      (data.averages?.weeksCounted ?? 0) > 0 ||
      data.averages?.milesPerWeek != null;
    await cacheSet(key, data, hasGp ? 60 : 15);
    return ok(data);
  } catch (error) {
    return fail(error);
  }
}
