import { getAuthUser } from "@/lib/auth";
import { getGpAdapter } from "@/lib/adapters/gp";
import { fail, ok } from "@/lib/http";
import { sendSms } from "@/lib/retention/sms";
import { retentionStore } from "@/lib/retention/store";

export const dynamic = "force-dynamic";

/**
 * Fleet-wide SMS (SimpleText replacement) via XXII Century GHL.
 * Body: { text, driverIds?: string[] } — omit driverIds to send to all active
 * drivers with a phone who are not opted out.
 */
export async function POST(req: Request) {
  try {
    const user = await getAuthUser();
    if (!user) {
      const err = new Error("Unauthorized");
      (err as Error & { status?: number }).status = 401;
      throw err;
    }

    const body = (await req.json().catch(() => ({}))) as {
      text?: string;
      driverIds?: string[];
    };
    const text = String(body.text || "").trim();
    if (!text) {
      const err = new Error("Message text is required");
      (err as Error & { status?: number }).status = 400;
      throw err;
    }

    const sentBy =
      (user.displayName || user.username || "Admin").trim() || "Admin";
    const all = await getGpAdapter().listDrivers({ includeInactive: false });
    const idFilter =
      Array.isArray(body.driverIds) && body.driverIds.length
        ? new Set(body.driverIds.map(String))
        : null;

    const targets = all.filter((d) => {
      if (idFilter && !idFilter.has(String(d.id))) return false;
      return Boolean(d.phone?.trim());
    });

    let sent = 0;
    let skipped = 0;
    let failed = 0;
    const errors: { driverId: string; name: string; error: string }[] = [];

    for (const driver of targets) {
      if (await retentionStore.isOptedOut(driver.phone)) {
        skipped += 1;
        continue;
      }
      const sms = await sendSms(driver.phone, text, {
        contactName: driver.name,
        driverId: driver.id,
        source: "broadcast",
        sentBy,
      });
      if (sms.ok) {
        sent += 1;
      } else {
        failed += 1;
        errors.push({
          driverId: String(driver.id),
          name: driver.name,
          error: sms.error || "send failed",
        });
      }
    }

    return ok({
      totalTargets: targets.length,
      sent,
      skipped,
      failed,
      errors: errors.slice(0, 25),
      smsProviderHint: "GHL (XXII Century)",
    });
  } catch (error) {
    return fail(error);
  }
}
