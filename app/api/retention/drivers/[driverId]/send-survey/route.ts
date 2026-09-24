import { sendSurvey } from "@/lib/retention/service";
import { fail, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ driverId: string }> }
) {
  try {
    const { driverId } = await params;
    return ok(await sendSurvey(driverId, "admin"), { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
