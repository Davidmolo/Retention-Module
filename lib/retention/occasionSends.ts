/**
 * Daily occasion runner (additive — does not replace regular survey cadence).
 *
 * Birthday  → wish SMS to driver + notice to leadership (no survey)
 * Anniversary / holiday → greeting by default; survey only if template has
 * {surveyUrl} AND driver is outside the normal 14/30-day cadence window.
 */
import type { RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import { getGpAdapter } from "@/lib/adapters/gp";
import { isSurveyEligible, surveyFrequencyLabel } from "./rules";
import { birthdayLeadershipNotice } from "./messages";
import {
  birthdayMessage,
  buildOccasionMessage,
  getMessageTemplateBody,
} from "./messageSend";
import { sendSms } from "./sms";
import {
  anniversaryMilestoneOn,
  holidaysOn,
  monthDayFromIso,
  sameMonthDay,
  todayIsoDate,
  todayMonthDay,
  todayYear,
  type HolidayDef,
} from "./occasions";
import { retentionStore } from "./store";
import { sendSurvey } from "./service";
import { retentionRosterActiveSql } from "./rosterExclusions";

export type OccasionSendResult = {
  driverId: string;
  name: string;
  occasionType: "birthday" | "anniversary" | "holiday";
  occasionKey: string;
  holidayName?: string;
  surveyUrl?: string;
  smsBody?: string;
  leadershipNotified?: string[];
  skipped?: string;
};

type DriverRow = {
  id: number;
  name: string;
  phone: string | null;
  status: string | null;
  hireDate: string | null;
  birthDate: string | null;
};

/** Leadership recipients for birthday notices (dispatch, maintenance, accounting, James). */
export function leadershipRecipients(): string[] {
  const list = [
    process.env.JAMES_EMAIL || "James@goxxii.com",
    process.env.MAINTENANCE_EMAIL || "Ozzy@goxxii.com",
    process.env.ACCOUNTING_EMAIL || "accounting@goxxii.com",
    ...(process.env.DISPATCH_EMAILS || "Art@goxxii.com,Eric@goxxii.com")
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean),
    ...(process.env.DISPATCH_MANAGER_EMAILS || "")
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean),
    ...(process.env.LEADERSHIP_EMAILS || "")
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean),
  ];
  return [...new Set(list.filter(Boolean))];
}

async function listActiveDriversForOccasions(): Promise<DriverRow[]> {
  const pool = getPool();
  const nameSql = `TRIM(CONCAT_WS(' ', d.first_name, d.middle_name, d.last_name))`;
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT d.id,
            ${nameSql} AS name,
            d.phone,
            d.status,
            COALESCE(
              DATE_FORMAT(d.source_created_at, '%Y-%m-%d'),
              DATE_FORMAT(d.date_added, '%Y-%m-%d')
            ) AS hireDate,
            d.dob AS birthDate
       FROM drivers d
      WHERE ${retentionRosterActiveSql("d")}`
  );
  return (rows as RowDataPacket[]).map((r) => ({
    id: Number(r.id),
    name: String(r.name || ""),
    phone: (r.phone as string) || null,
    status: (r.status as string) || null,
    hireDate: r.hireDate ? String(r.hireDate).slice(0, 10) : null,
    birthDate: r.birthDate ? String(r.birthDate).slice(0, 10) : null,
  }));
}

async function sendBirthdayWish(opts: {
  driverId: string;
  driverName: string;
  phone: string | null;
}): Promise<OccasionSendResult> {
  const occasionKey = `birthday-${todayYear()}`;
  if (
    await retentionStore.hasOccasionSend(opts.driverId, "birthday", occasionKey)
  ) {
    return {
      driverId: opts.driverId,
      name: opts.driverName,
      occasionType: "birthday",
      occasionKey,
      skipped: "already_sent",
    };
  }

  if (!opts.phone) {
    return {
      driverId: opts.driverId,
      name: opts.driverName,
      occasionType: "birthday",
      occasionKey,
      skipped: "no_phone",
    };
  }
  if (await retentionStore.isOptedOut(opts.phone)) {
    return {
      driverId: opts.driverId,
      name: opts.driverName,
      occasionType: "birthday",
      occasionKey,
      skipped: "opted_out",
    };
  }

  const smsBody = await birthdayMessage({ driverName: opts.driverName });
  const { sendSms } = await import("./sms");
  const sms = await sendSms(opts.phone, smsBody, {
    contactName: opts.driverName,
    driverId: opts.driverId,
    source: "occasion",
    sentBy: "System",
  });
  if (!sms.ok) {
    return {
      driverId: opts.driverId,
      name: opts.driverName,
      occasionType: "birthday",
      occasionKey,
      skipped: sms.error || "sms_failed",
    };
  }

  const leadership = leadershipRecipients();
  const notice = birthdayLeadershipNotice({
    driverName: opts.driverName,
    driverId: opts.driverId,
  });
  const { sendRetentionEmail, buildBirthdayLeadershipEmail } = await import(
    "./email"
  );
  for (const recipient of leadership) {
    const mail = buildBirthdayLeadershipEmail({
      driverName: opts.driverName,
      driverId: opts.driverId,
      noticeText: notice,
    });
    const send = await sendRetentionEmail({
      to: recipient,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
    await retentionStore.addNotificationLog({
      trigger: "driver_birthday",
      recipient,
      department: "Leadership",
      driverId: opts.driverId,
      sendResult: { channel: "email", ...send, body: notice },
    });
  }

  await retentionStore.recordOccasionSend({
    driverId: opts.driverId,
    occasionType: "birthday",
    occasionKey,
    surveyOccurrenceId: null,
    messageBody: smsBody,
  });

  return {
    driverId: opts.driverId,
    name: opts.driverName,
    occasionType: "birthday",
    occasionKey,
    smsBody,
    leadershipNotified: leadership,
  };
}

async function sendSurveyOccasion(opts: {
  driverId: string;
  driverName: string;
  phone?: string | null;
  occasionType: "anniversary" | "holiday";
  occasionKey: string;
  holidayName?: string;
  milestone?: import("./occasions").AnniversaryMilestone;
}): Promise<OccasionSendResult> {
  if (
    await retentionStore.hasOccasionSend(
      opts.driverId,
      opts.occasionType,
      opts.occasionKey
    )
  ) {
    return {
      driverId: opts.driverId,
      name: opts.driverName,
      occasionType: opts.occasionType,
      occasionKey: opts.occasionKey,
      holidayName: opts.holidayName,
      skipped: "already_sent",
    };
  }

  const templateBody = await getMessageTemplateBody(opts.occasionType);
  const wantsSurvey = templateBody.includes("{surveyUrl}");

  // Survey-linked occasions still require tenure eligibility.
  // Also: never mint a second survey inside the normal 14/30-day cadence window
  // (or while a regular link is still open) — fall back to greeting-only instead.
  let forceGreetingOnly = !wantsSurvey;
  if (wantsSurvey) {
    const gp = await getGpAdapter().getDriver(opts.driverId);
    if (!gp || !isSurveyEligible(gp)) {
      return {
        driverId: opts.driverId,
        name: opts.driverName,
        occasionType: opts.occasionType,
        occasionKey: opts.occasionKey,
        holidayName: opts.holidayName,
        skipped: "not_eligible",
      };
    }

    const occurrences = await retentionStore.listSurveyOccurrences(
      opts.driverId
    );
    const openRegular = occurrences.find(
      (o) =>
        (o.surveyKind || "regular") === "regular" &&
        ["pending", "sent", "reminded"].includes(o.responseState)
    );
    if (openRegular) {
      forceGreetingOnly = true;
    } else {
      const lastRegular = occurrences
        .filter(
          (o) =>
            (o.surveyKind || "regular") === "regular" &&
            (o.sentAt || o.completedAt)
        )
        .sort((a, b) => {
          const ta = new Date(
            a.completedAt || a.sentAt || a.createdAt
          ).getTime();
          const tb = new Date(
            b.completedAt || b.sentAt || b.createdAt
          ).getTime();
          return tb - ta;
        })[0];
      if (lastRegular) {
        const gapDays =
          surveyFrequencyLabel(gp) === "every_2_weeks" ? 14 : 30;
        const lastAt = new Date(
          lastRegular.completedAt ||
            lastRegular.sentAt ||
            lastRegular.createdAt
        ).getTime();
        if (Date.now() - lastAt < gapDays * 86_400_000) {
          forceGreetingOnly = true;
        }
      }
    }
  }

  // Greeting-only (no {surveyUrl} in template, or cadence cooldown) — SMS, no survey.
  if (forceGreetingOnly) {
    let smsBody = await buildOccasionMessage(opts.occasionType, {
      driverName: opts.driverName,
      milestone: opts.milestone,
      holidayName: opts.holidayName,
      surveyUrl: "",
    });
    // If a custom template still contains {surveyUrl}, drop the token so we
    // never SMS a broken placeholder when falling back to greeting-only.
    smsBody = smsBody
      .replaceAll("{surveyUrl}", "")
      .replace(/\s{2,}/g, " ")
      .replace(/\s+([.!?])/g, "$1")
      .trim();
    const phone = opts.phone?.trim();
    if (!phone) {
      return {
        driverId: opts.driverId,
        name: opts.driverName,
        occasionType: opts.occasionType,
        occasionKey: opts.occasionKey,
        holidayName: opts.holidayName,
        skipped: "no_phone",
      };
    }
    if (await retentionStore.isOptedOut(phone)) {
      return {
        driverId: opts.driverId,
        name: opts.driverName,
        occasionType: opts.occasionType,
        occasionKey: opts.occasionKey,
        holidayName: opts.holidayName,
        skipped: "opted_out",
      };
    }
    const sms = await sendSms(phone, smsBody, {
      contactName: opts.driverName,
      driverId: opts.driverId,
      source: "occasion",
      sentBy: "System",
    });
    if (!sms.ok) {
      throw new Error(sms.error || "SMS send failed");
    }
    await retentionStore.recordOccasionSend({
      driverId: opts.driverId,
      occasionType: opts.occasionType,
      occasionKey: opts.occasionKey,
      holidayName: opts.holidayName ?? null,
      surveyOccurrenceId: null,
      messageBody: smsBody,
    });
    return {
      driverId: opts.driverId,
      name: opts.driverName,
      occasionType: opts.occasionType,
      occasionKey: opts.occasionKey,
      holidayName: opts.holidayName,
      smsBody,
    };
  }

  const smsBodyTemplate = await buildOccasionMessage(opts.occasionType, {
    driverName: opts.driverName,
    surveyUrl: "{surveyUrl}",
    milestone: opts.milestone,
    holidayName: opts.holidayName,
  });

  const sent = await sendSurvey(opts.driverId, "system", { smsBodyTemplate });

  await retentionStore.recordOccasionSend({
    driverId: opts.driverId,
    occasionType: opts.occasionType,
    occasionKey: opts.occasionKey,
    holidayName: opts.holidayName ?? null,
    surveyOccurrenceId: sent.occurrence.id,
    messageBody: sent.smsBody,
  });

  return {
    driverId: opts.driverId,
    name: opts.driverName,
    occasionType: opts.occasionType,
    occasionKey: opts.occasionKey,
    holidayName: opts.holidayName,
    surveyUrl: sent.surveyUrl,
    smsBody: sent.smsBody,
  };
}

export async function runDailyOccasionSends(now = new Date()): Promise<{
  date: string;
  holidays: string[];
  results: OccasionSendResult[];
}> {
  const md = todayMonthDay(now);
  const year = todayYear(now);
  const todayIso = todayIsoDate(now);
  const todaysHolidays = holidaysOn(md, year, now);
  const drivers = await listActiveDriversForOccasions();
  const adapter = getGpAdapter();
  const results: OccasionSendResult[] = [];

  for (const row of drivers) {
    const gp = await adapter.getDriver(String(row.id));
    if (!gp) continue;

    // Birthday: wish only (no survey eligibility required beyond active roster)
    const birthMd = monthDayFromIso(row.birthDate);
    if (birthMd && sameMonthDay(birthMd, md)) {
      results.push(
        await sendBirthdayWish({
          driverId: String(row.id),
          driverName: row.name || gp.name,
          phone: row.phone || gp.phone || null,
        }).catch((e) => ({
          driverId: String(row.id),
          name: row.name,
          occasionType: "birthday" as const,
          occasionKey: `birthday-${year}`,
          skipped: (e as Error).message,
        }))
      );
    }

    if (row.hireDate) {
      const milestone = anniversaryMilestoneOn(row.hireDate, todayIso);
      if (milestone) {
        results.push(
          await sendSurveyOccasion({
            driverId: String(row.id),
            driverName: row.name || gp.name,
            phone: row.phone || gp.phone || null,
            occasionType: "anniversary",
            occasionKey: milestone.occasionKey,
            milestone,
          }).catch((e) => ({
            driverId: String(row.id),
            name: row.name,
            occasionType: "anniversary" as const,
            occasionKey: milestone.occasionKey,
            skipped: (e as Error).message,
          }))
        );
      }
    }

    for (const h of todaysHolidays) {
      results.push(
        await sendSurveyOccasion({
          driverId: String(row.id),
          driverName: row.name || gp.name,
          phone: row.phone || gp.phone || null,
          occasionType: "holiday",
          occasionKey: `holiday-${h.key}-${year}`,
          holidayName: h.name,
        }).catch((e) => ({
          driverId: String(row.id),
          name: row.name,
          occasionType: "holiday" as const,
          occasionKey: `holiday-${h.key}-${year}`,
          holidayName: h.name,
          skipped: (e as Error).message,
        }))
      );
    }
  }

  return {
    date: todayIso,
    holidays: todaysHolidays.map((h: HolidayDef) => h.name),
    results,
  };
}
