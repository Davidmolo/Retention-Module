import { fail, ok } from "@/lib/http";
import {
  getDetention,
  listDetentionNotes,
  updateDetention,
} from "@/lib/detention/store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const detention = await getDetention(id);
    if (!detention) {
      const err = new Error("Detention not found");
      (err as Error & { status?: number }).status = 404;
      throw err;
    }
    const notes = await listDetentionNotes(id);
    return ok({ detention, notes });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const body = (await request.json().catch(() => ({}))) as {
      status?: string;
      awaitingUs?: boolean;
      followUpDate?: string | null;
      settledAmount?: number | null;
      actor?: string | null;
    };

    const detention = await updateDetention(id, {
      status: body.status,
      awaitingUs: body.awaitingUs,
      followUpDate: body.followUpDate,
      settledAmount: body.settledAmount,
      actor: body.actor || null,
    });
    const notes = await listDetentionNotes(id);
    return ok({ detention, notes });
  } catch (error) {
    return fail(error);
  }
}
