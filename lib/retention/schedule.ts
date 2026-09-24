/**
 * Regular survey cadence (additive to birthday/anniversary/holiday occasions).
 * New drivers (<3 months) — company and owner-operator: every 14 days
 * Established (≥3 months) — company and owner-operator: every 30 days
 *
 * While a survey link is still open (sent/reminded/pending), cadence never mints a
 * new link — reminders / manual Send reuse the same URL until submit or expiry.
 * Sends are staggered so eligible drivers are not messaged all at once.
 */
import { getGpAdapter } from "@/lib/adapters/gp";
import {
  DEFAULT_SEND_STAGGER_MS,
  MAX_SURVEY_REMINDERS,
  SURVEY_REMINDER_AFTER_DAYS,
} from "./constants";
import { isSurveyEligible, surveyFrequencyLabel } from "./rules";
import { retentionStore } from "./store";
import { resendSurveyOccurrence, sendSurvey } from "./service";

const MS_DAY = 86_400_000;

function cadenceDays(label: ReturnType<typeof surveyFrequencyLabel>): number {
  return label === "every_2_weeks" ? 14 : 30;
}

function staggerMs(): number {
  const raw = Number(process.env.RETENTION_SEND_STAGGER_MS);
  if (Number.isFinite(raw) && raw >= 0) return raw;
  return DEFAULT_SEND_STAGGER_MS;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export type ScheduleResult = {
  driverId: string;
  name: string;
  action: "sent" | "skipped" | "resent";
  reason?: string;
  surveyUrl?: string;
};

export async function runScheduledSurveys(): Promise<{
  sent: number;
  skipped: number;
  results: ScheduleResult[];
}> {
  const drivers = await getGpAdapter().listDrivers({ includeInactive: false });
  const results: ScheduleResult[] = [];
  let sent = 0;
  let skipped = 0;
  const now = Date.now();
  const gap = staggerMs();
  let firstSend = true;

  for (const driver of drivers) {
    if (!isSurveyEligible(driver)) {
      results.push({
        driverId: driver.id,
        name: driver.name,
        action: "skipped",
        reason: "not_eligible",
      });
      skipped += 1;
      continue;
    }

    const occurrences = await retentionStore.listSurveyOccurrences(driver.id);
    const open = occurrences.find(
      (o) =>
        (o.surveyKind || "regular") === "regular" &&
        ["pending", "sent", "reminded"].includes(o.responseState)
    );
    // Open link still live — cadence does not create another; reminders handle resends.
    if (open) {
      results.push({
        driverId: driver.id,
        name: driver.name,
        action: "skipped",
        reason: "open_survey",
      });
      skipped += 1;
      continue;
    }

    const last = occurrences
      .filter(
        (o) =>
          (o.surveyKind || "regular") === "regular" && (o.sentAt || o.completedAt)
      )
      .sort((a, b) => {
        const ta = new Date(a.completedAt || a.sentAt || a.createdAt).getTime();
        const tb = new Date(b.completedAt || b.sentAt || b.createdAt).getTime();
        return tb - ta;
      })[0];

    const days = cadenceDays(surveyFrequencyLabel(driver));
    if (last) {
      const lastAt = new Date(
        last.completedAt || last.sentAt || last.createdAt
      ).getTime();
      if (now - lastAt < days * MS_DAY) {
        results.push({
          driverId: driver.id,
          name: driver.name,
          action: "skipped",
          reason: `within_${days}d`,
        });
        skipped += 1;
        continue;
      }
    }

    if (!firstSend && gap > 0) {
      await sleep(gap);
    }

    try {
      const out = await sendSurvey(driver.id, "system");
      results.push({
        driverId: driver.id,
        name: driver.name,
        action: out.resent ? "resent" : "sent",
        surveyUrl: out.surveyUrl,
      });
      sent += 1;
      firstSend = false;
    } catch (e) {
      results.push({
        driverId: driver.id,
        name: driver.name,
        action: "skipped",
        reason: (e as Error).message,
      });
      skipped += 1;
    }
  }

  return { sent, skipped, results };
}

/** Remind unanswered surveys; after max reminders + wait, mark non_response. */
export async function runSurveyReminders(opts?: {
  reminderAfterDays?: number;
  maxReminders?: number;
}): Promise<{ reminded: number; closed: number; skipped: number }> {
  const afterDays = opts?.reminderAfterDays ?? SURVEY_REMINDER_AFTER_DAYS;
  const maxReminders = opts?.maxReminders ?? MAX_SURVEY_REMINDERS;
  const all = await retentionStore.listSurveyOccurrences();
  let reminded = 0;
  let closed = 0;
  let skipped = 0;
  const now = Date.now();
  const gap = staggerMs();
  let firstTouch = true;

  for (const occ of all) {
    if (!["sent", "reminded"].includes(occ.responseState)) {
      skipped += 1;
      continue;
    }

    const lastTouch = new Date(
      occ.updatedAt || occ.sentAt || occ.createdAt
    ).getTime();

    // After max reminders: wait another reminder window, then close so cadence can continue.
    if (occ.reminderCount >= maxReminders) {
      if (!lastTouch || now - lastTouch < afterDays * MS_DAY) {
        skipped += 1;
        continue;
      }
      await retentionStore.updateSurveyOccurrence(occ.id, {
        responseState: "non_response",
      });
      closed += 1;
      continue;
    }

    if (!lastTouch || now - lastTouch < afterDays * MS_DAY) {
      skipped += 1;
      continue;
    }

    if (!firstTouch && gap > 0) {
      await sleep(gap);
    }

    try {
      await resendSurveyOccurrence(occ, { reminderCopy: true });
      reminded += 1;
      firstTouch = false;
    } catch {
      skipped += 1;
    }
  }

  if (reminded > 0 || closed > 0) {
    const { CACHE_KEYS, cacheDel } = await import("@/lib/cache");
    await cacheDel([CACHE_KEYS.retentionOverview]);
  }

  return { reminded, closed, skipped };
}
