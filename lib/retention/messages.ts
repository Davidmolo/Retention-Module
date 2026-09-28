import type { AnniversaryMilestone } from "./occasions";

export type OccasionKind = "birthday" | "anniversary" | "holiday";
export type { AnniversaryMilestone };

export type MessageTemplateId =
  | "birthday"
  | "anniversary"
  | "holiday"
  | "survey-invite"
  | "survey-reminder"
  | "post-resolve"
  | "post-resolve-resend";

export type MessageTemplateMeta = {
  id: MessageTemplateId;
  title: string;
  description: string;
  channel: "SMS to driver";
  /** Short guide shown under the title to help editors write the SMS. */
  editorGuide: string;
  /** Placeholders the editor may use in this template. */
  placeholders: { token: string; meaning: string }[];
  /** Built-in default body (with placeholders). */
  defaultBody: string;
};

export function firstName(fullName: string): string {
  const part = fullName.trim().split(/\s+/)[0];
  return part || "there";
}

export function milestoneLabel(m: AnniversaryMilestone): string {
  if (m.kind === "months") {
    return m.months === 3 ? "3 months" : "6 months";
  }
  if (m.years === 1) return "1 year";
  return `${m.years} years`;
}

export function feedbackPeriodLabel(m: AnniversaryMilestone): string {
  if (m.kind === "months") {
    return m.months === 3 ? "first 3 months" : "first 6 months";
  }
  if (m.years === 1) return "first 12 months";
  return `past year`;
}

/** Default SMS bodies (editable in Configure; saved copies override these). */
export const DEFAULT_MESSAGE_BODIES: Record<MessageTemplateId, string> = {
  birthday:
    `Happy Birthday, {FirstName}! ` +
    `We wanted to take a moment and express our appreciation for you on your special day. ` +
    `Wishing you a wonderful birthday from everyone at XXII.`,
  anniversary:
    `Happy {MilestoneLabel} work anniversary, {FirstName}! ` +
    `We have hit this milestone together. We appreciate your dedication and commitment, ` +
    `and we hope you feel that you are getting the support and commitment from our team as well. ` +
    `Please take a moment to provide feedback on the {FeedbackPeriod} you've been with us ` +
    `and if there's anything we should do to make improvements for you: {surveyUrl}`,
  holiday:
    `Happy {HolidayName}, {FirstName}! Warm wishes from the XXII team. ` +
    `If you have a moment, we'd appreciate your feedback: {surveyUrl}`,
  "survey-invite": `Hi {FirstName}, XXII wants your feedback: {surveyUrl}`,
  "survey-reminder":
    `Hi {FirstName}, quick reminder — XXII still wants your feedback: {surveyUrl}`,
  "post-resolve":
    `Hi {FirstName}, your recent issue was marked resolved. How did we do? {surveyUrl}`,
  "post-resolve-resend":
    `Hi {FirstName}, quick check — how did we do resolving your recent issue? {surveyUrl}`,
};

export const MESSAGE_TEMPLATES: MessageTemplateMeta[] = [
  {
    id: "birthday",
    title: "Birthday wish",
    description:
      "Sent on the driver’s birthday. Appreciation only — no survey link.",
    channel: "SMS to driver",
    editorGuide:
      "Keep it warm and short. Thank the driver personally. Do not add a survey link on birthdays.",
    placeholders: [
      { token: "{FirstName}", meaning: "Driver’s first name" },
    ],
    defaultBody: DEFAULT_MESSAGE_BODIES.birthday,
  },
  {
    id: "anniversary",
    title: "Work anniversary",
    description:
      "Sent at 3 months, 6 months, 1 year, and each year after. Includes a survey link.",
    channel: "SMS to driver",
    editorGuide:
      "Congratulate the milestone, reinforce support, then ask for feedback. Always keep {surveyUrl} in the message.",
    placeholders: [
      { token: "{FirstName}", meaning: "Driver’s first name" },
      {
        token: "{MilestoneLabel}",
        meaning: 'Milestone text, e.g. "3 months" or "1 year"',
      },
      {
        token: "{FeedbackPeriod}",
        meaning: 'Period being reviewed, e.g. "first 3 months"',
      },
      { token: "{surveyUrl}", meaning: "Unique survey link (required)" },
    ],
    defaultBody: DEFAULT_MESSAGE_BODIES.anniversary,
  },
  {
    id: "holiday",
    title: "Holiday greeting",
    description:
      "Sent on configured company holidays. Includes a survey link.",
    channel: "SMS to driver",
    editorGuide:
      "Lead with the holiday greeting, then a soft ask for feedback. Keep {HolidayName} and {surveyUrl}.",
    placeholders: [
      { token: "{FirstName}", meaning: "Driver’s first name" },
      { token: "{HolidayName}", meaning: "Holiday name, e.g. Thanksgiving" },
      { token: "{surveyUrl}", meaning: "Unique survey link (required)" },
    ],
    defaultBody: DEFAULT_MESSAGE_BODIES.holiday,
  },
  {
    id: "survey-invite",
    title: "Survey invite",
    description:
      "Regular cadence and manual “Send survey” messages.",
    channel: "SMS to driver",
    editorGuide:
      "One clear ask for feedback. Keep the tone light. {surveyUrl} must appear exactly once.",
    placeholders: [
      { token: "{FirstName}", meaning: "Driver’s first name" },
      { token: "{surveyUrl}", meaning: "Unique survey link (required)" },
    ],
    defaultBody: DEFAULT_MESSAGE_BODIES["survey-invite"],
  },
  {
    id: "survey-reminder",
    title: "Survey reminder",
    description:
      "Automatic reminder while a survey link is still open.",
    channel: "SMS to driver",
    editorGuide:
      "Polite nudge that the survey is still open. Sent only if the driver has not submitted yet — completed surveys never get reminders. Keep {surveyUrl}.",
    placeholders: [
      { token: "{FirstName}", meaning: "Driver’s first name" },
      { token: "{surveyUrl}", meaning: "Unique survey link (required)" },
    ],
    defaultBody: DEFAULT_MESSAGE_BODIES["survey-reminder"],
  },
  {
    id: "post-resolve",
    title: "Post-resolve follow-up",
    description:
      "Sent when an open issue/case is marked resolved.",
    channel: "SMS to driver",
    editorGuide:
      "Reference that their issue was resolved and ask how it went. Keep {surveyUrl}.",
    placeholders: [
      { token: "{FirstName}", meaning: "Driver’s first name" },
      { token: "{surveyUrl}", meaning: "Unique survey link (required)" },
    ],
    defaultBody: DEFAULT_MESSAGE_BODIES["post-resolve"],
  },
  {
    id: "post-resolve-resend",
    title: "Post-resolve resend",
    description:
      "Used when resending an open post-resolve survey link.",
    channel: "SMS to driver",
    editorGuide:
      "Shorter follow-up for a resend. Keep {surveyUrl} so the same survey link is reused.",
    placeholders: [
      { token: "{FirstName}", meaning: "Driver’s first name" },
      { token: "{surveyUrl}", meaning: "Unique survey link (required)" },
    ],
    defaultBody: DEFAULT_MESSAGE_BODIES["post-resolve-resend"],
  },
];

const TEMPLATE_IDS = new Set<string>(MESSAGE_TEMPLATES.map((t) => t.id));

export function isMessageTemplateId(id: string): id is MessageTemplateId {
  return TEMPLATE_IDS.has(id);
}

export function applyMessageTemplate(
  template: string,
  vars: Record<string, string>
): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    const token = key.startsWith("{") ? key : `{${key}}`;
    out = out.split(token).join(value);
  }
  return out;
}

export type RenderMessageVars = {
  driverName: string;
  surveyUrl?: string;
  milestone?: AnniversaryMilestone;
  holidayName?: string;
};

export function varsForMessage(
  id: MessageTemplateId,
  opts: RenderMessageVars
): Record<string, string> {
  const name = firstName(opts.driverName);
  const base: Record<string, string> = {
    FirstName: name,
    surveyUrl: opts.surveyUrl || "{surveyUrl}",
  };
  if (id === "anniversary") {
    const m = opts.milestone ?? {
      kind: "years" as const,
      years: 1,
      occasionKey: "anniversary-1y",
    };
    base.MilestoneLabel = milestoneLabel(m);
    base.FeedbackPeriod = feedbackPeriodLabel(m);
  }
  if (id === "holiday") {
    base.HolidayName = opts.holidayName || "Holiday";
  }
  return base;
}

/** Internal email/SMS notice to leadership when a driver has a birthday. */
export function birthdayLeadershipNotice(opts: {
  driverName: string;
  driverId: string;
}): string {
  return (
    `Driver birthday today: ${opts.driverName} (ID ${opts.driverId}). ` +
    `A birthday appreciation message was sent to the driver. ` +
    `Please join us in wishing them a happy birthday.`
  );
}
