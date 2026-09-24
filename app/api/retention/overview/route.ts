import { getOverview } from "@/lib/retention/service";
import { fail, ok } from "@/lib/http";
import { CACHE_KEYS, cacheGet, cacheSet } from "@/lib/cache";

export const dynamic = "force-dynamic";

const OVERVIEW_TTL_SEC = 45;

export async function GET() {
  try {
    const cached = await cacheGet<unknown>(CACHE_KEYS.retentionOverview);
    if (cached) return ok(cached);

    const data = await getOverview();
    await cacheSet(CACHE_KEYS.retentionOverview, data, OVERVIEW_TTL_SEC);
    return ok(data);
  } catch (error) {
    return fail(error);
  }
}

