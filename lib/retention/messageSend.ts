import { retentionStore } from "./store";
import {
  DEFAULT_MESSAGE_BODIES,
  MESSAGE_TEMPLATES,
  applyMessageTemplate,
  varsForMessage,
  type MessageTemplateId,
  type MessageTemplateMeta,
  type OccasionKind,
  type RenderMessageVars,
} from "./messages";

export async function getMessageTemplateBody(
  id: MessageTemplateId
): Promise<string> {
  try {
    const saved = await retentionStore.getMessageTemplate(id);
    if (saved?.body?.trim()) return saved.body;
  } catch (e) {
    console.error("[messages] getMessageTemplateBody", id, (e as Error).message);
  }
  return DEFAULT_MESSAGE_BODIES[id];
}

export async function listMessageTemplatesForEditor(): Promise<
  (MessageTemplateMeta & {
    body: string;
    isCustom: boolean;
    updatedAt: string | null;
  })[]
> {
  let saved: Record<string, { body: string; updatedAt: string }> = {};
  try {
    saved = await retentionStore.listMessageTemplates();
  } catch (e) {
    console.error("[messages] listMessageTemplates", (e as Error).message);
  }
  return MESSAGE_TEMPLATES.map((meta) => {
    const row = saved[meta.id];
    return {
      ...meta,
      body: row?.body?.trim() ? row.body : meta.defaultBody,
      isCustom: Boolean(row?.body?.trim()),
      updatedAt: row?.updatedAt ?? null,
    };
  });
}

export async function renderRetentionSms(
  id: MessageTemplateId,
  opts: RenderMessageVars
): Promise<string> {
  const body = await getMessageTemplateBody(id);
  return applyMessageTemplate(body, varsForMessage(id, opts));
}

/** Driver SMS — birthday only, no survey link. */
export async function birthdayMessage(opts: {
  driverName: string;
}): Promise<string> {
  return renderRetentionSms("birthday", { driverName: opts.driverName });
}

/**
 * Anniversary SMS to driver — includes survey link.
 * Covers 3 months, 6 months, 1 year, and every year after.
 */
export async function anniversaryMessage(opts: {
  driverName: string;
  milestone: NonNullable<RenderMessageVars["milestone"]>;
  surveyUrl: string;
}): Promise<string> {
  return renderRetentionSms("anniversary", opts);
}

export async function holidayMessage(opts: {
  driverName: string;
  holidayName: string;
  surveyUrl: string;
}): Promise<string> {
  return renderRetentionSms("holiday", opts);
}

/** Regular cadence / manual survey invite SMS. */
export async function surveyInviteMessage(opts: {
  driverName: string;
  surveyUrl: string;
}): Promise<string> {
  return renderRetentionSms("survey-invite", opts);
}

/** Reminder SMS while a survey link is still open. */
export async function surveyReminderMessage(opts: {
  driverName: string;
  surveyUrl: string;
}): Promise<string> {
  return renderRetentionSms("survey-reminder", opts);
}

/** Post-resolve follow-up survey SMS (first send). */
export async function postResolveSurveyMessage(opts: {
  driverName: string;
  surveyUrl: string;
}): Promise<string> {
  return renderRetentionSms("post-resolve", opts);
}

/** Post-resolve follow-up when resending an open link (keeps {surveyUrl} for replace). */
export async function postResolveSurveyResendTemplate(opts: {
  driverName: string;
}): Promise<string> {
  return renderRetentionSms("post-resolve-resend", {
    driverName: opts.driverName,
    surveyUrl: "{surveyUrl}",
  });
}

export async function buildOccasionMessage(
  kind: OccasionKind,
  opts: {
    driverName: string;
    surveyUrl?: string;
    milestone?: RenderMessageVars["milestone"];
    holidayName?: string;
  }
): Promise<string> {
  if (kind === "birthday") {
    return birthdayMessage({ driverName: opts.driverName });
  }
  if (kind === "anniversary") {
    return anniversaryMessage({
      driverName: opts.driverName,
      milestone: opts.milestone ?? {
        kind: "years",
        years: 1,
        occasionKey: "anniversary-1y",
      },
      surveyUrl: opts.surveyUrl || "{surveyUrl}",
    });
  }
  return holidayMessage({
    driverName: opts.driverName,
    holidayName: opts.holidayName || "Holiday",
    surveyUrl: opts.surveyUrl || "{surveyUrl}",
  });
}
