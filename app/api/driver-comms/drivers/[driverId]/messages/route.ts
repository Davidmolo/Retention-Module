import { getAuthUser } from "@/lib/auth";
import { getGpAdapter } from "@/lib/adapters/gp";
import { listDriverSmsThread } from "@/lib/driverComms/smsLog";
import { parseSmsComposeRequest } from "@/lib/driverComms/smsMedia";
import { fail, ok } from "@/lib/http";
import { sendSms } from "@/lib/retention/sms";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ driverId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const { driverId } = await ctx.params;
    const messages = await listDriverSmsThread(driverId);
    return ok({ messages });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: Request, ctx: Ctx) {
  try {
    const { driverId } = await ctx.params;
    const user = await getAuthUser();
    const { text, files } = await parseSmsComposeRequest(req);
    if (!text && !files.length) {
      const err = new Error("Message text or attachment is required");
      (err as Error & { status?: number }).status = 400;
      throw err;
    }

    const driver = await getGpAdapter().getDriver(driverId);
    if (!driver) {
      const err = new Error("Driver not found");
      (err as Error & { status?: number }).status = 404;
      throw err;
    }
    if (!driver.phone?.trim()) {
      const err = new Error("Driver has no phone number");
      (err as Error & { status?: number }).status = 400;
      throw err;
    }

    const sentBy =
      (user?.displayName || user?.username || "Admin").trim() || "Admin";
    const sms = await sendSms(driver.phone, text, {
      contactName: driver.name,
      driverId: driver.id,
      source: "manual",
      sentBy,
      files,
    });
    if (!sms.ok) {
      const err = new Error(sms.error || "SMS send failed");
      (err as Error & { status?: number }).status = 502;
      throw err;
    }

    return ok(
      {
        messages: await listDriverSmsThread(driverId),
        smsMocked: sms.mocked,
        smsProvider: sms.provider,
        attachmentUrls: sms.attachmentUrls || [],
      },
      { status: 201 }
    );
  } catch (error) {
    return fail(error);
  }
}
