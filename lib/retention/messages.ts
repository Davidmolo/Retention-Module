import type { AnniversaryMilestone } from "./occasions";

export type OccasionKind = "birthday" | "anniversary" | "holiday";
export type { AnniversaryMilestone };

function firstName(fullName: string): string {
  const part = fullName.trim().split(/\s+/)[0];
  return part || "there";
}

function milestoneLabel(m: AnniversaryMilestone): string {
  if (m.kind === "months") {
    return m.months === 3 ? "3 months" : "6 months";
  }
  if (m.years === 1) return "1 year";
  return `${m.years} years`;
}

function feedbackPeriodLabel(m: AnniversaryMilestone): string {
  if (m.kind === "months") {
    return m.months === 3 ? "first 3 months" : "first 6 months";
  }
  if (m.years === 1) return "first 12 months";
  return `past year`;
}

/** Driver SMS — birthday only, no survey link. */
export function birthdayMessage(opts: { driverName: string }): string {
  const name = firstName(opts.driverName);
  return (
    `Happy Birthday, ${name}! ` +
    `We wanted to take a moment and express our appreciation for you on your special day. ` +
    `Wishing you a wonderful birthday from everyone at XXII.`
  );
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

/**
 * Anniversary SMS to driver — includes survey link.
 * Covers 3 months, 6 months, 1 year, and every year after.
 */
export function anniversaryMessage(opts: {
  driverName: string;
  milestone: AnniversaryMilestone;
  surveyUrl: string;
}): string {
  const name = firstName(opts.driverName);
  const label = milestoneLabel(opts.milestone);
  const period = feedbackPeriodLabel(opts.milestone);
  return (
    `Happy ${label} work anniversary, ${name}! ` +
    `We have hit this milestone together. We appreciate your dedication and commitment, ` +
    `and we hope you feel that you are getting the support and commitment from our team as well. ` +
    `Please take a moment to provide feedback on the ${period} you've been with us ` +
    `and if there's anything we should do to make improvements for you: ${opts.surveyUrl}`
  );
}

export function holidayMessage(opts: {
  driverName: string;
  holidayName: string;
  surveyUrl: string;
}): string {
  const name = firstName(opts.driverName);
  return (
    `Happy ${opts.holidayName}, ${name}! Warm wishes from the XXII team. ` +
    `If you have a moment, we'd appreciate your feedback: ${opts.surveyUrl}`
  );
}

/** Regular cadence / manual survey invite SMS. */
export function surveyInviteMessage(opts: {
  driverName: string;
  surveyUrl: string;
}): string {
  const name = firstName(opts.driverName);
  return `Hi ${name}, XXII wants your feedback: ${opts.surveyUrl}`;
}

/** Reminder SMS while a survey link is still open. */
export function surveyReminderMessage(opts: {
  driverName: string;
  surveyUrl: string;
}): string {
  const name = firstName(opts.driverName);
  return `Hi ${name}, quick reminder — XXII still wants your feedback: ${opts.surveyUrl}`;
}

/** Post-resolve follow-up survey SMS (first send). */
export function postResolveSurveyMessage(opts: {
  driverName: string;
  surveyUrl: string;
}): string {
  const name = firstName(opts.driverName);
  return `Hi ${name}, your recent issue was marked resolved. How did we do? ${opts.surveyUrl}`;
}

/** Post-resolve follow-up when resending an open link. */
export function postResolveSurveyResendTemplate(opts: {
  driverName: string;
}): string {
  const name = firstName(opts.driverName);
  return `Hi ${name}, quick check — how did we do resolving your recent issue? {surveyUrl}`;
}

export function buildOccasionMessage(
  kind: OccasionKind,
  opts: {
    driverName: string;
    surveyUrl?: string;
    milestone?: AnniversaryMilestone;
    holidayName?: string;
  }
): string {
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

export type MessageTemplateId =
  | "birthday"
  | "anniversary"
  | "holiday"
  | "survey-invite"
  | "survey-reminder"
  | "post-resolve"
  | "post-resolve-resend";

export type MessageTemplate = {
  id: MessageTemplateId;
  title: string;
  description: string;
  channel: "SMS to driver";
  /** Sample body with placeholders like {FirstName} and {surveyUrl}. */
  sample: string;
};

const SAMPLE_NAME = "{FirstName}";
const SAMPLE_URL = "{surveyUrl}";

/** Catalog of every driver-facing SMS body used by Retention. */
export const MESSAGE_TEMPLATES: MessageTemplate[] = [
  {
    id: "birthday",
    title: "Birthday wish",
    description:
      "Sent on the driver’s birthday. Appreciation only — no survey link.",
    channel: "SMS to driver",
    sample: birthdayMessage({ driverName: SAMPLE_NAME }),
  },
  {
    id: "anniversary",
    title: "Work anniversary",
    description:
      "Sent at 3 months, 6 months, 1 year, and each year after. Includes a survey link.",
    channel: "SMS to driver",
    sample: anniversaryMessage({
      driverName: SAMPLE_NAME,
      milestone: { kind: "years", years: 1, occasionKey: "anniversary-1y" },
      surveyUrl: SAMPLE_URL,
    }),
  },
  {
    id: "holiday",
    title: "Holiday greeting",
    description:
      "Sent on configured company holidays. Includes a survey link.",
    channel: "SMS to driver",
    sample: holidayMessage({
      driverName: SAMPLE_NAME,
      holidayName: "{HolidayName}",
      surveyUrl: SAMPLE_URL,
    }),
  },
  {
    id: "survey-invite",
    title: "Survey invite",
    description:
      "Regular cadence and manual “Send survey” messages.",
    channel: "SMS to driver",
    sample: surveyInviteMessage({
      driverName: SAMPLE_NAME,
      surveyUrl: SAMPLE_URL,
    }),
  },
  {
    id: "survey-reminder",
    title: "Survey reminder",
    description:
      "Automatic reminder while a survey link is still open.",
    channel: "SMS to driver",
    sample: surveyReminderMessage({
      driverName: SAMPLE_NAME,
      surveyUrl: SAMPLE_URL,
    }),
  },
  {
    id: "post-resolve",
    title: "Post-resolve follow-up",
    description:
      "Sent when an open issue/case is marked resolved.",
    channel: "SMS to driver",
    sample: postResolveSurveyMessage({
      driverName: SAMPLE_NAME,
      surveyUrl: SAMPLE_URL,
    }),
  },
  {
    id: "post-resolve-resend",
    title: "Post-resolve resend",
    description:
      "Used when resending an open post-resolve survey link.",
    channel: "SMS to driver",
    sample: postResolveSurveyResendTemplate({
      driverName: SAMPLE_NAME,
    }).replaceAll("{surveyUrl}", SAMPLE_URL),
  },
];
