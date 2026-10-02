import { fail, ok } from "@/lib/http";
import { addDetentionNote, getDetention } from "@/lib/detention/store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const existing = await getDetention(id);
    if (!existing) {
      const err = new Error("Detention not found");
      (err as Error & { status?: number }).status = 404;
      throw err;
    }
    const body = (await request.json().catch(() => ({}))) as {
      body?: string;
      author?: string | null;
    };
    const note = await addDetentionNote({
      detentionId: id,
      author: body.author || null,
      body: String(body.body || ""),
    });
    return ok({ note });
  } catch (error) {
    return fail(error);
  }
}
