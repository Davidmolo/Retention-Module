import { addNote } from "@/lib/retention/service";
import { fail, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ driverId: string }> }
) {
  try {
    const { driverId } = await params;
    const body = await req.json();
    return ok(
      await addNote({
        driverId,
        caseId: body.caseId,
        author: body.author,
        text: body.text,
      }),
      { status: 201 }
    );
  } catch (error) {
    return fail(error);
  }
}
