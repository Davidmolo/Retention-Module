import { submitSurvey } from "@/lib/retention/service";
import { fail, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const body = await req.json();
    return ok(await submitSurvey(token, body), { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
