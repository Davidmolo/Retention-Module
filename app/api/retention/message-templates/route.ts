import { fail, ok } from "@/lib/http";
import {
  DEFAULT_MESSAGE_BODIES,
  isMessageTemplateId,
  type MessageTemplateId,
} from "@/lib/retention/messages";
import { listMessageTemplatesForEditor } from "@/lib/retention/messageSend";
import { retentionStore } from "@/lib/retention/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const templates = await listMessageTemplatesForEditor();
    return ok({ templates });
  } catch (error) {
    return fail(error);
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const id = String(body?.id || "");
    const text = typeof body?.body === "string" ? body.body : null;
    const reset = Boolean(body?.reset);

    if (!isMessageTemplateId(id)) {
      const err = new Error("Unknown message template");
      (err as Error & { status?: number }).status = 400;
      throw err;
    }

    if (reset) {
      await retentionStore.deleteMessageTemplate(id);
      return ok({
        id,
        body: DEFAULT_MESSAGE_BODIES[id as MessageTemplateId],
        isCustom: false,
        updatedAt: null,
      });
    }

    if (text == null) {
      const err = new Error("Message body is required");
      (err as Error & { status?: number }).status = 400;
      throw err;
    }

    const trimmed = text.trim();
    if (!trimmed) {
      const err = new Error("Message body cannot be empty");
      (err as Error & { status?: number }).status = 400;
      throw err;
    }

    const meta = (
      await listMessageTemplatesForEditor()
    ).find((t) => t.id === id);
    const requiresSurvey = meta?.placeholders.some((p) => p.token === "{surveyUrl}");
    if (requiresSurvey && !trimmed.includes("{surveyUrl}")) {
      const err = new Error(
        "This message must include {surveyUrl} so the survey link can be inserted."
      );
      (err as Error & { status?: number }).status = 400;
      throw err;
    }

    const saved = await retentionStore.upsertMessageTemplate(id, trimmed);
    return ok({
      id: saved.id,
      body: saved.body,
      isCustom: true,
      updatedAt: saved.updatedAt,
    });
  } catch (error) {
    return fail(error);
  }
}
