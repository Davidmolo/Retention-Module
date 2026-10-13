import { getAuthUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { listDriverSmsThread } from "@/lib/driverComms/smsLog";
import { sendSms } from "@/lib/retention/sms";
import { getGpAdapter } from "@/lib/adapters/gp";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ driverId: string }> }
) {
  try {
    const { driverId } = await params;
    const messages = await listDriverSmsThread(driverId);
    return ok({ messages });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ driverId: string }> }
) {
  try {
    const { driverId } = await params;
    const user = await getAuthUser();
    const body = (await req.json().catch(() => ({}))) as { text?: string };
    const text = String(body.text || "").trim();
    if (!text) {
      const err = new Error("Message text is required");
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
    });
    if (!sms.ok) {
      const err = new Error(sms.error || "SMS send failed");
      (err as Error & { status?: number }).status = 502;
      throw err;
    }

    const messages = await listDriverSmsThread(driverId);
    return ok(
      {
        messages,
        smsMocked: sms.mocked,
        smsProvider: sms.provider,
      },
      { status: 201 }
    );
  } catch (error) {
    return fail(error);
  }
}
