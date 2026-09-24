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
