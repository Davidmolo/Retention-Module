import { getAuthUser } from "@/lib/auth";
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
    const user = await getAuthUser();
    const author =
      (user?.displayName || user?.username || body.author || "Admin").trim() ||
      "Admin";
    return ok(
      await addNote({
        driverId,
        caseId: body.caseId,
        author,
        text: body.text,
      }),
      { status: 201 }
    );
  } catch (error) {
    return fail(error);
  }
}
