import { getAuthUser } from "@/lib/auth";
import { getGpAdapter } from "@/lib/adapters/gp";
import { filesFromFormData } from "@/lib/driverComms/smsMedia";
import { fail, ok } from "@/lib/http";
import { isRetentionExcludedDriverId } from "@/lib/retention/rosterExclusions";
import { sendSms } from "@/lib/retention/sms";
import { retentionStore } from "@/lib/retention/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Fleet-wide SMS/MMS (SimpleText replacement) via XXII Century GHL.
 * multipart: text + files[] — or JSON { text, driverIds? }.
 */
export async function POST(req: Request) {
  try {
    const user = await getAuthUser();
    if (!user) {
      const err = new Error("Unauthorized");
      (err as Error & { status?: number }).status = 401;
      throw err;
    }

    const ct = req.headers.get("content-type") || "";
    let text = "";
    let files: Awaited<ReturnType<typeof filesFromFormData>> = [];
    let driverIds: string[] | null = null;

    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      text = String(form.get("text") || "").trim();
      files = await filesFromFormData(form);
      const rawIds = String(form.get("driverIds") || "").trim();
      if (rawIds) {
        try {
          const parsed = JSON.parse(rawIds) as unknown;
          if (Array.isArray(parsed)) driverIds = parsed.map(String);
        } catch {
          driverIds = rawIds
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
        }
      }
    } else {
      const body = (await req.json().catch(() => ({}))) as {
        text?: string;
        driverIds?: string[];
      };
      text = String(body.text || "").trim();
      if (Array.isArray(body.driverIds) && body.driverIds.length) {
        driverIds = body.driverIds.map(String);
      }
    }

    if (!text && !files.length) {
      const err = new Error("Message text or attachment is required");
      (err as Error & { status?: number }).status = 400;
      throw err;
    }

    const sentBy =
      (user.displayName || user.username || "Admin").trim() || "Admin";
    const all = await getGpAdapter().listDrivers({ includeInactive: false });
    const idFilter = driverIds ? new Set(driverIds) : null;

    const targets = all.filter((d) => {
      if (isRetentionExcludedDriverId(d.id)) return false;
      if (idFilter && !idFilter.has(String(d.id))) return false;
      return Boolean(d.phone?.trim());
    });

    let sent = 0;
    let skipped = 0;
    let failed = 0;
    const errors: { driverId: string; name: string; error: string }[] = [];
    /** Upload once, reuse public URLs for the rest of the blast. */
    let sharedAttachmentUrls: string[] | null = null;

    for (const driver of targets) {
      if (await retentionStore.isOptedOut(driver.phone)) {
        skipped += 1;
        continue;
      }

      const useFiles =
        files.length > 0 && sharedAttachmentUrls === null ? files : undefined;
      const useUrls =
        sharedAttachmentUrls && sharedAttachmentUrls.length
          ? sharedAttachmentUrls
          : undefined;

      const sms = await sendSms(driver.phone, text, {
        contactName: driver.name,
        driverId: driver.id,
        source: "broadcast",
        sentBy,
        files: useFiles,
        attachments: useUrls,
      });
      if (sms.ok) {
        sent += 1;
        if (
          files.length > 0 &&
          sharedAttachmentUrls === null &&
          sms.attachmentUrls?.length
        ) {
          sharedAttachmentUrls = sms.attachmentUrls;
        }
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
