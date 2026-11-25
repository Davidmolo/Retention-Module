import { getAuthUser } from "@/lib/auth";
import { getGpAdapter } from "@/lib/adapters/gp";
import { createCampaign, listCampaigns } from "@/lib/driverComms/campaigns";
import { isRetentionExcludedDriverId } from "@/lib/retention/rosterExclusions";
import { filesFromFormData } from "@/lib/driverComms/smsMedia";
import { fail, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) {
      const err = new Error("Unauthorized");
      (err as Error & { status?: number }).status = 401;
      throw err;
    }
    const drivers = await getGpAdapter().listDrivers({ includeInactive: false });
    return ok({
      campaigns: await listCampaigns(),
      drivers: drivers
        .filter(
          (driver) =>
            Boolean(driver.phone?.trim()) &&
            !isRetentionExcludedDriverId(driver.id)
        )
        .map((driver) => ({ id: String(driver.id), name: driver.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) {
      const err = new Error("Unauthorized");
      (err as Error & { status?: number }).status = 401;
      throw err;
    }
    const contentType = request.headers.get("content-type") || "";
    let title = "";
    let text = "";
    let scheduledAt: string | null = null;
    let driverIds: string[] | null = null;
    let files: { buffer: Buffer; filename: string; contentType: string }[] = [];
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      title = String(form.get("title") || "");
      text = String(form.get("text") || "");
      scheduledAt = String(form.get("scheduledAt") || "") || null;
      const rawIds = String(form.get("driverIds") || "");
      if (rawIds) {
        const parsed = JSON.parse(rawIds) as unknown;
        driverIds = Array.isArray(parsed) ? parsed.map(String) : null;
      }
      files = await filesFromFormData(form);
    } else {
      const body = (await request.json().catch(() => ({}))) as {
        title?: string;
        text?: string;
        driverIds?: string[];
        scheduledAt?: string;
      };
      title = String(body.title || "");
      text = String(body.text || "");
      scheduledAt = body.scheduledAt || null;
      driverIds = Array.isArray(body.driverIds) ? body.driverIds : null;
    }
    const created = await createCampaign({
      title,
      body: text,
      userId: user.id,
      userName: user.displayName || user.username,
      username: user.username,
      driverIds,
      scheduledAt,
      files,
    });
    return ok(created);
  } catch (error) {
    return fail(error);
  }
}
