import { nanoid } from "nanoid";
import { getGpAdapter, getGpMode } from "@/lib/adapters/gp";
import { toAppCalendarDate } from "@/lib/dates";
import {
  DEPARTMENTS,
  GOOGLE_REVIEW_URL,
  type CaseStatus,
  type DepartmentFeedback,
  type SurveyOccurrence,
  type SurveyResponse,
} from "./types";
import { retentionStore } from "./store";
import {
  driverTypeLabel,
  isHighOverall,
  isLowOverall,
  isSurveyEligible,
  surveyFrequencyLabel,
  tenureCategory,
  daysSinceHire,
} from "./rules";
import { ensureDemoSeed } from "./seed";
import { CACHE_KEYS, cacheDel } from "@/lib/cache";

async function bustRetentionCaches(driverId?: string) {
  const keys = [CACHE_KEYS.retentionOverview];
  if (driverId) keys.push(CACHE_KEYS.retentionDriver(driverId));
  await cacheDel(keys);
}

const EMAILS = {
  james: process.env.JAMES_EMAIL || "James@goxxii.com",
  maintenance: process.env.MAINTENANCE_EMAIL || "Ozzy@goxxii.com",
  accounting: process.env.ACCOUNTING_EMAIL || "accounting@goxxii.com",
  dispatch: (process.env.DISPATCH_EMAILS || "Art@goxxii.com,Eric@goxxii.com")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean),
  safety: process.env.SAFETY_EMAIL || "Safety@goxxii.com",
};

function recipientsForDepartment(department: string) {
  switch (department) {
    case "Maintenance":
      return [EMAILS.maintenance];
    case "Accounting":
      return [EMAILS.accounting];
    case "Dispatch":
      return EMAILS.dispatch;
    case "Safety":
      return [EMAILS.safety];
    default:
      return [];
  }
}

export async function getOverview() {
  await ensureDemoSeed();
  const [drivers, allResponses, allOccurrences, allCases] = await Promise.all([
    getGpAdapter().listDrivers({ includeInactive: false }),
    retentionStore.listSurveyResponses(),
    retentionStore.listSurveyOccurrences(),
    retentionStore.listRetentionCases(),
  ]);

  const activeIds = new Set(drivers.map((d) => d.id));
  const resolutionOccIds = new Set(
    allOccurrences
      .filter((o) => o.surveyKind === "resolution")
      .map((o) => o.id)
  );
  const responses = allResponses.filter(
    (r) =>
      activeIds.has(r.driverId) && !resolutionOccIds.has(r.surveyOccurrenceId)
  );
  const driverSubmitted = responses.filter((r) => r.submittedBy !== "admin");
  const occurrences = allOccurrences.filter(
    (o) =>
      activeIds.has(o.driverId) && (o.surveyKind || "regular") === "regular"
  );
  const cases = allCases.filter((c) => activeIds.has(c.driverId));

  const responsesByDriver = new Map<string, typeof responses>();
  for (const r of driverSubmitted) {
    const bucket = responsesByDriver.get(r.driverId);
    if (bucket) bucket.push(r);
    else responsesByDriver.set(r.driverId, [r]);
  }

  const occurrencesByDriver = new Map<string, typeof occurrences>();
  for (const o of occurrences) {
    const bucket = occurrencesByDriver.get(o.driverId);
    if (bucket) bucket.push(o);
    else occurrencesByDriver.set(o.driverId, [o]);
  }

  const casesByDriver = new Map<string, typeof cases>();
  for (const c of cases) {
    const bucket = casesByDriver.get(c.driverId);
    if (bucket) bucket.push(c);
    else casesByDriver.set(c.driverId, [c]);
  }

  const rows: Array<{
    driverId: string;
    name: string;
    email: string;
    phone: string;
    avatarInitials: string;
    driverType: string;
    driverTypeLabel: string;
    hireDate: string;
    dispatcher: string;
    eligible: boolean;
    daysSinceHire: number;
    tenureCategory: string;
    surveyFrequency: string;
    latestOverallRating: number | null;
    latestComment: string;
    latestSurveyAt: string | null;
    atRisk: boolean;
    caseStatus: string | null;
    caseId: string | null;
    nonResponse: boolean;
    repeatedLowRatings: boolean;
    responseCount: number;
    /** Lowest department rated ≤3 (for filters); full ratings in departmentRatings */
    focusDepartment: string | null;
    departmentRatings: { department: string; rating: number }[];
  }> = [];

  const driverNameById = new Map<string, string>();

  for (const driver of drivers) {
    const driverResponses = responsesByDriver.get(driver.id) || [];
    const driverOccurrences = occurrencesByDriver.get(driver.id) || [];
    const driverCases = casesByDriver.get(driver.id) || [];
    const latest = driverResponses[0] || null;
    const latestOccurrence = driverOccurrences[0] || null;
    const openCase =
      driverCases.find(
        (c) => c.status !== "Resolved" && c.status !== "Completed"
      ) ||
      [...driverCases].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ||
      null;
    const lowCount = driverResponses.reduce(
      (n, r) => n + (r.overallRating <= 3 ? 1 : 0),
      0
    );

    driverNameById.set(driver.id, driver.name);

    rows.push({
      driverId: driver.id,
      name: driver.name,
      email: driver.email,
      phone: driver.phone,
      avatarInitials: driver.avatarInitials,
      driverType: driver.driverType,
      driverTypeLabel: driverTypeLabel(driver.driverType),
      hireDate: driver.hireDate,
      dispatcher: driver.dispatcher,
      eligible: isSurveyEligible(driver),
      daysSinceHire: daysSinceHire(driver.hireDate),
      tenureCategory: tenureCategory(driver.hireDate, driver.driverType),
      surveyFrequency: surveyFrequencyLabel(driver),
      latestOverallRating: latest?.overallRating ?? null,
      latestComment: latest?.generalComment || "",
      latestSurveyAt: latest?.submittedAt || latestOccurrence?.sentAt || null,
      atRisk: Boolean(
        openCase?.atRisk &&
          openCase.status !== "Resolved" &&
          openCase.status !== "Completed"
      ),
      caseStatus: openCase?.status || null,
      caseId: openCase?.id || null,
      nonResponse: latestOccurrence?.responseState === "non_response",
      repeatedLowRatings: lowCount >= 2,
      responseCount: driverResponses.length,
      focusDepartment:
        latest?.departmentFeedback
          ?.filter((d) => d.rating <= 3)
          .sort((a, b) => a.rating - b.rating)[0]?.department || null,
      departmentRatings: DEPARTMENTS.map((department) => {
        const found = (latest?.departmentFeedback || []).find(
          (d) => d.department === department
        );
        return {
          department,
          rating: found?.rating && found.rating >= 1 ? found.rating : 0,
        };
      }).filter((d) => d.rating >= 1),
    });
  }

  const ratingCounts = [0, 0, 0, 0, 0, 0];
  const issueCounts: Record<string, number> = Object.fromEntries(
    DEPARTMENTS.map((d) => [d, 0])
  );
  for (const r of driverSubmitted) {
    if (r.overallRating >= 1 && r.overallRating <= 5) {
      ratingCounts[r.overallRating] += 1;
    }
    for (const d of r.departmentFeedback || []) {
      if (d.rating <= 3 && d.department in issueCounts) {
        issueCounts[d.department] += 1;
      }
    }
  }
  const ratingDistribution = [1, 2, 3, 4, 5].map((star) => ({
    star,
    count: ratingCounts[star],
  }));
  const issueBreakdown = DEPARTMENTS.map((department) => ({
    department,
    count: issueCounts[department] || 0,
  }));

  const surveyTrend = buildSurveyTrend(occurrences, driverSubmitted);

  const rated = rows.filter((r) => r.latestOverallRating != null);
  const satisfactionRate = rated.length
    ? Math.round(
        (rated.filter((r) => (r.latestOverallRating || 0) >= 4).length /
          rated.length) *
          100
      )
    : null;

  const caseByDriverId = new Map(
    rows.map((r) => [r.driverId, { status: r.caseStatus, atRisk: r.atRisk }])
  );

  // responses already ORDER BY submitted_at DESC from store
  const recentResponses = responses.slice(0, 8).map((r) => {
    const open = caseByDriverId.get(r.driverId);
    const departmentRatings = DEPARTMENTS.map((department) => {
      const found = (r.departmentFeedback || []).find(
        (d) => d.department === department
      );
      return {
        department,
        rating: found?.rating && found.rating >= 1 ? found.rating : 0,
      };
    }).filter((d) => d.rating >= 1);

    let status: string;
    if (r.branch === "positive") {
      status = "Completed";
    } else if (open?.status) {
      // Prefer live case status (Open / In Progress / Resolved / Completed).
      status = open.status;
    } else {
      status = "At Risk";
    }

    return {
      id: r.id,
      date: r.submittedAt,
      driverId: r.driverId,
      driverName: driverNameById.get(r.driverId) || r.driverId,
      overallRating: r.overallRating,
      department:
        departmentRatings
          .filter((d) => d.rating <= 3)
          .sort((a, b) => a.rating - b.rating)[0]?.department || null,
      departmentRatings,
      status,
      comment: r.generalComment,
      submittedBy: r.submittedBy,
    };
  });

  // Sent / reminded only — still waiting on the driver (active roster).
  const pendingSurveys = occurrences.filter((o) =>
    ["sent", "reminded"].includes(o.responseState)
  ).length;
  const nonResponseSurveys = occurrences.filter(
    (o) => o.responseState === "non_response"
  ).length;

  return {
    kpis: {
      satisfactionRate,
      atRiskCount: rows.filter((r) => r.atRisk).length,
      pendingSurveys,
      // All responses list = submitted + pending + non_response.
      totalResponses: responses.length + pendingSurveys + nonResponseSurveys,
    },
    charts: { ratingDistribution, issueBreakdown, surveyTrend },
    drivers: rows,
    recentResponses,
    gpMode: getGpMode(),
  };
}

function buildSurveyTrend(
  occurrences: SurveyOccurrence[],
  responses: SurveyResponse[]
) {
  const days = 8;
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key =
      toAppCalendarDate(d.toISOString()) || d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: process.env.APP_TIMEZONE?.trim() || "America/Chicago",
    });
    const sent = occurrences.filter(
      (o) =>
        o.sentAt &&
        (toAppCalendarDate(o.sentAt) || o.sentAt.slice(0, 10)) === key
    ).length;
    const responded = responses.filter(
      (r) =>
        (toAppCalendarDate(r.submittedAt) || r.submittedAt.slice(0, 10)) === key
    ).length;
    out.push({ date: key, label, sent, responded });
  }
  return out;
}

export async function getDriverDetail(driverId: string) {
  await ensureDemoSeed();

  // Ensure GP weeks in the background — never block the driver page open.
  // (Generating missing weeks can take minutes and made detail feel "broken".)
  void import("@/lib/sources/ensureGpWeeks")
    .then(({ ensureRecentGpReportWeeks }) => ensureRecentGpReportWeeks(6))
    .catch((e) =>
      console.warn(
        "[retention] ensureRecentGpReportWeeks:",
        (e as Error).message
      )
    );

  const adapter = getGpAdapter();
  const [driver, averages, responses, occurrences, retentionCase, notes] =
    await Promise.all([
      adapter.getDriver(driverId),
      adapter.getSixWeekAverages(driverId),
      retentionStore.listSurveyResponses(driverId),
      retentionStore.listSurveyOccurrences(driverId),
      retentionStore.getOpenOrLatestCase(driverId),
      retentionStore.listInternalNotes(driverId),
    ]);
  if (!driver) {
    const err = new Error("Driver not found");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  return {
    driver: {
      ...driver,
      driverTypeLabel: driverTypeLabel(driver.driverType),
    },
    averages,
    responses: responses.filter((r) => {
      const occ = occurrences.find((o) => o.id === r.surveyOccurrenceId);
      return (occ?.surveyKind || "regular") !== "resolution";
    }),
    resolutionResponses: responses.filter((r) => {
      const occ = occurrences.find((o) => o.id === r.surveyOccurrenceId);
      return occ?.surveyKind === "resolution";
    }),
    occurrences,
    retentionCase,
    notes,
    eligible: isSurveyEligible(driver),
    surveyFrequency: surveyFrequencyLabel(driver),
    tenureCategory: tenureCategory(driver.hireDate, driver.driverType),
    gpMode: getGpMode(),
  };
}

import { sendSms } from "./sms";

const OPEN_SURVEY_STATES = new Set(["pending", "sent", "reminded"]);

function buildSurveyUrl(token: string) {
  const base =
    process.env.NEXT_PUBLIC_SURVEY_BASE_URL || "http://localhost:3000/s";
  return `${base.replace(/\/$/, "")}/${token}`;
}

function isSurveyBaseLocal(url: string) {
  try {
    const host = new URL(url).hostname;
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.endsWith(".local")
    );
  } catch {
    return /localhost|127\.0\.0\.1/i.test(url);
  }
}

/** Latest open regular survey (not resolution) for a driver, if any. */
export async function findOpenSurveyOccurrence(driverId: string) {
  const occurrences = await retentionStore.listSurveyOccurrences(driverId);
  return (
    occurrences.find(
      (o) =>
        (o.surveyKind || "regular") === "regular" &&
        OPEN_SURVEY_STATES.has(o.responseState)
    ) || null
  );
}

async function findOpenResolutionSurvey(driverId: string, caseId?: string) {
  const occurrences = await retentionStore.listSurveyOccurrences(driverId);
  return (
    occurrences.find(
      (o) =>
        o.surveyKind === "resolution" &&
        OPEN_SURVEY_STATES.has(o.responseState) &&
        (!caseId || o.caseId === caseId)
    ) || null
  );
}

/**
 * Post-resolve follow-up: how quickly / efficiently / effectively was the issue fixed.
 */
export async function sendResolutionSurvey(
  driverId: string,
  caseId: string,
  triggeredBy: "system" | "admin" = "system"
) {
  const driver = await getGpAdapter().getDriver(driverId);
  if (!driver) {
    const err = new Error("Driver not found");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  if (driver.status !== "active") {
    const err = new Error("Inactive drivers cannot receive surveys");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  if (!driver.phone?.trim()) {
    const err = new Error("Driver has no phone number");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  if (await retentionStore.isOptedOut(driver.phone)) {
    const err = new Error("Driver phone has opted out of SMS surveys");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }

  const open = await findOpenResolutionSurvey(driver.id, caseId);
  if (open) {
    return resendSurveyOccurrence(open, {
      reminderCopy: false,
      smsBodyTemplate: `Hi ${driver.name.split(" ")[0]}, quick check — how did we do resolving your recent issue? {surveyUrl}`,
    });
  }

  const token = nanoid(24);
  const surveyUrl = buildSurveyUrl(token);
  const firstName = driver.name.split(" ")[0];
  const smsBody = `Hi ${firstName}, your recent issue was marked resolved. How did we do? ${surveyUrl}`;

  const sms = await sendSms(driver.phone, smsBody, {
    contactName: driver.name,
  });
  if (!sms.ok) {
    const err = new Error(sms.error || "SMS send failed");
    (err as Error & { status?: number }).status = 502;
    throw err;
  }

  const occurrence = await retentionStore.createSurveyOccurrence({
    driverId: driver.id,
    token,
    scheduledAt: new Date().toISOString(),
    sentAt: new Date().toISOString(),
    triggeredBy,
    surveyKind: "resolution",
    caseId,
    responseState: "sent",
    providerMessageId: sms.providerMessageId,
  });

  await bustRetentionCaches(driver.id);
  return {
    occurrence,
    surveyUrl,
    driver,
    smsBody,
    smsMocked: sms.mocked,
    smsProvider: sms.provider,
    surveyBaseIsLocal: isSurveyBaseLocal(surveyUrl),
    resent: false as const,
  };
}

/**
 * Resend an existing survey link over SMS (same token).
 * Used by manual Send and automated reminders until submit or non_response.
 */
export async function resendSurveyOccurrence(
  occurrence: SurveyOccurrence,
  opts?: {
    smsBodyTemplate?: string;
    /** When true, message uses reminder wording (default true if already sent once). */
    reminderCopy?: boolean;
  }
) {
  const driver = await getGpAdapter().getDriver(occurrence.driverId);
  if (!driver) {
    const err = new Error("Driver not found");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  if (driver.status !== "active") {
    const err = new Error("Inactive drivers cannot receive surveys");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  if (!driver.phone?.trim()) {
    const err = new Error("Driver has no phone number");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  if (await retentionStore.isOptedOut(driver.phone)) {
    const err = new Error("Driver phone has opted out of SMS surveys");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  if (!OPEN_SURVEY_STATES.has(occurrence.responseState)) {
    const err = new Error(
      "This survey link is closed — create a new survey after it expires or is submitted"
    );
    (err as Error & { status?: number }).status = 400;
    throw err;
  }

  const surveyUrl = buildSurveyUrl(occurrence.token);
  const firstName = driver.name.split(" ")[0];
  const useReminder =
    opts?.reminderCopy ??
    Boolean(occurrence.sentAt || occurrence.responseState !== "pending");
  const defaultBody = useReminder
    ? `Hi ${firstName}, quick reminder — XXII still wants your feedback: ${surveyUrl}`
    : `Hi ${firstName}, XXII wants your feedback: ${surveyUrl}`;
  const smsBody = opts?.smsBodyTemplate
    ? opts.smsBodyTemplate.replaceAll("{surveyUrl}", surveyUrl)
    : defaultBody;

  const sms = await sendSms(driver.phone, smsBody, {
    contactName: driver.name,
  });
  if (!sms.ok) {
    const err = new Error(sms.error || "SMS send failed");
    (err as Error & { status?: number }).status = 502;
    throw err;
  }

  const updated = await retentionStore.updateSurveyOccurrence(occurrence.id, {
    responseState: "reminded",
    reminderCount: (occurrence.reminderCount || 0) + 1,
    providerMessageId: sms.providerMessageId || occurrence.providerMessageId,
    sentAt: occurrence.sentAt || new Date().toISOString(),
  });

  await bustRetentionCaches(driver.id);
  return {
    occurrence: updated || occurrence,
    surveyUrl,
    driver,
    smsBody,
    smsMocked: sms.mocked,
    smsProvider: sms.provider,
    surveyBaseIsLocal: isSurveyBaseLocal(surveyUrl),
    resent: true as const,
  };
}

export async function sendSurvey(
  driverId: string,
  triggeredBy: "system" | "admin" = "admin",
  opts?: { smsBodyTemplate?: string }
) {
  await ensureDemoSeed();
  const driver = await getGpAdapter().getDriver(driverId);
  if (!driver) {
    const err = new Error("Driver not found");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  if (driver.status !== "active") {
    const err = new Error("Inactive drivers cannot receive surveys");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  if (!driver.phone?.trim()) {
    const err = new Error("Driver has no phone number");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  if (await retentionStore.isOptedOut(driver.phone)) {
    const err = new Error("Driver phone has opted out of SMS surveys");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  if (triggeredBy === "system" && !isSurveyEligible(driver)) {
    const err = new Error("Driver not yet eligible (need 7 days tenure)");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }

  // If a survey is still open (not submitted / not expired), resend the same link.
  const open = await findOpenSurveyOccurrence(driver.id);
  if (open) {
    return resendSurveyOccurrence(open, {
      smsBodyTemplate: opts?.smsBodyTemplate,
      // Manual / cadence Send keeps the normal invite text.
      // Only runSurveyReminders uses reminderCopy: true ("quick reminder…").
      reminderCopy: false,
    });
  }

  const token = nanoid(24);
  const surveyUrl = buildSurveyUrl(token);

  const defaultBody = `Hi ${driver.name.split(" ")[0]}, XXII wants your feedback: ${surveyUrl}`;
  const smsBody = opts?.smsBodyTemplate
    ? opts.smsBodyTemplate.replaceAll("{surveyUrl}", surveyUrl)
    : defaultBody;

  const sms = await sendSms(driver.phone, smsBody, {
    contactName: driver.name,
  });
  if (!sms.ok) {
    const err = new Error(sms.error || "SMS send failed");
    (err as Error & { status?: number }).status = 502;
    throw err;
  }

  const occurrence = await retentionStore.createSurveyOccurrence({
    driverId: driver.id,
    token,
    scheduledAt: new Date().toISOString(),
    sentAt: new Date().toISOString(),
    triggeredBy,
    surveyKind: "regular",
    responseState: "sent",
    providerMessageId: sms.providerMessageId,
  });

  await bustRetentionCaches(driver.id);
  return {
    occurrence,
    surveyUrl,
    driver,
    smsBody,
    smsMocked: sms.mocked,
    smsProvider: sms.provider,
    surveyBaseIsLocal: isSurveyBaseLocal(surveyUrl),
    resent: false as const,
  };
}

export async function getSurveySession(token: string) {
  await ensureDemoSeed();
  const occurrence = await retentionStore.findSurveyByToken(token);
  if (!occurrence) {
    const err = new Error("Survey link not found or expired");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  if (occurrence.responseState === "completed") {
    const err = new Error("This survey was already submitted");
    (err as Error & { status?: number; code?: string }).status = 409;
    (err as Error & { code?: string }).code = "ALREADY_SUBMITTED";
    throw err;
  }
  if (occurrence.responseState === "non_response") {
    const err = new Error("This survey link has expired");
    (err as Error & { status?: number; code?: string }).status = 410;
    (err as Error & { code?: string }).code = "EXPIRED";
    throw err;
  }
  const driver = await getGpAdapter().getDriver(occurrence.driverId);
  return {
    token,
    occurrence,
    surveyKind: occurrence.surveyKind || "regular",
    driver: driver
      ? { id: driver.id, name: driver.name, firstName: driver.name.split(" ")[0] }
      : null,
    departments: DEPARTMENTS,
    googleReviewUrl: GOOGLE_REVIEW_URL,
  };
}

export async function submitSurvey(
  token: string,
  payload: {
    overallRating?: number;
    generalComment?: string;
    departmentFeedback?: DepartmentFeedback[];
    resolutionFeedback?: {
      quickly: number;
      efficiently: number;
      effectively: number;
    };
    /** Set when admin opens the link from driver detail (?via=admin). */
    submittedBy?: "driver" | "admin";
  }
) {
  await ensureDemoSeed();
  const occurrence = await retentionStore.findSurveyByToken(token);
  if (!occurrence) {
    const err = new Error("Survey link not found or expired");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  if (occurrence.responseState === "completed") {
    const err = new Error("Survey already submitted");
    (err as Error & { status?: number }).status = 409;
    throw err;
  }
  if (occurrence.responseState === "non_response") {
    const err = new Error("This survey link has expired");
    (err as Error & { status?: number }).status = 410;
    throw err;
  }

  const submittedBy: "driver" | "admin" =
    payload.submittedBy === "admin" ? "admin" : "driver";

  if ((occurrence.surveyKind || "regular") === "resolution") {
    return submitResolutionSurvey(occurrence, payload, submittedBy);
  }

  const overallRating = Number(payload.overallRating);
  if (!overallRating || overallRating < 1 || overallRating > 5) {
    const err = new Error("overallRating must be 1-5");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }

  const driver = await getGpAdapter().getDriver(occurrence.driverId);
  let departmentFeedback: DepartmentFeedback[] = [];
  const generalComment = payload.generalComment || "";
  let retentionCase = null;
  let branch: "positive" | "at_risk" = "positive";

  if (isLowOverall(overallRating)) {
    branch = "at_risk";
    if (!String(generalComment).trim()) {
      const err = new Error("A written comment is required for ratings 1-3");
      (err as Error & { status?: number }).status = 400;
      throw err;
    }
    const incoming = Array.isArray(payload.departmentFeedback)
      ? payload.departmentFeedback
      : [];
    departmentFeedback = DEPARTMENTS.map((dept) => {
      const found = incoming.find((d) => d.department === dept);
      const rating = Number(found?.rating);
      if (!rating || rating < 1 || rating > 5) {
        const err = new Error(`Missing 1-5 rating for ${dept}`);
        (err as Error & { status?: number }).status = 400;
        throw err;
      }
      return { department: dept, rating, comment: found?.comment || "" };
    });
    retentionCase = await retentionStore.upsertRetentionCase(occurrence.driverId, {
      atRisk: true,
      status: "Open",
      sourceSurveyId: occurrence.id,
      overallRating,
    });
  } else if (!isHighOverall(overallRating)) {
    const err = new Error("Invalid rating");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }

  const response = await retentionStore.createSurveyResponse({
    driverId: occurrence.driverId,
    surveyOccurrenceId: occurrence.id,
    overallRating,
    generalComment,
    departmentFeedback,
    branch,
    submittedBy,
  });
  await retentionStore.updateSurveyOccurrence(occurrence.id, {
    responseState: "completed",
    completedAt: new Date().toISOString(),
  });

  const alerts: unknown[] = [];
  if (branch === "at_risk" && driver) {
    const { sendRetentionEmail, buildAtRiskOverallEmail, buildDepartmentLowEmail, jamesEmail } =
      await import("./email");
    const appBase =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
      process.env.APP_URL?.replace(/\/$/, "") ||
      "http://localhost:3000";
    const caseUrl = `${appBase}/retention/drivers/${driver.id}`;
    const james = jamesEmail();

    const overallMail = buildAtRiskOverallEmail({
      driverName: driver.name,
      driverId: driver.id,
      overallRating,
      generalComment,
      dispatcher: driver.dispatcher,
      departmentFeedback,
      caseUrl,
    });
    const overallSend = await sendRetentionEmail({
      to: james,
      subject: overallMail.subject,
      text: overallMail.text,
      html: overallMail.html,
    });
    await retentionStore.addNotificationLog({
      trigger: "overall_low",
      recipient: overallSend.deliveredTo?.[0] || james,
      driverId: driver.id,
      surveyResponseId: response.id,
      sendResult: overallSend,
    });
    alerts.push({
      to: overallSend.deliveredTo || [james],
      intendedTo: overallSend.intendedTo || [james],
      event: "overall_low",
      mocked: overallSend.mocked,
      testing: overallSend.testing,
    });

    for (const dept of departmentFeedback) {
      if (dept.rating > 3) continue;
      const deptRecipients = recipientsForDepartment(dept.department);
      // James always gets department low alerts too (CC if not already To).
      const toList = deptRecipients.filter((e) => e.toLowerCase() !== james.toLowerCase());
      const ccList = toList.length ? [james] : [];
      const primaryTo = toList.length ? toList : [james];
      const deptMail = buildDepartmentLowEmail({
        driverName: driver.name,
        driverId: driver.id,
        department: dept.department,
        rating: dept.rating,
        comment: dept.comment,
        overallRating,
        caseUrl,
      });
      const deptSend = await sendRetentionEmail({
        to: primaryTo,
        cc: ccList,
        subject: deptMail.subject,
        text: deptMail.text,
        html: deptMail.html,
      });
      const loggedRecipients = deptSend.deliveredTo?.length
        ? deptSend.deliveredTo
        : [...primaryTo, ...ccList];
      for (const to of loggedRecipients) {
        await retentionStore.addNotificationLog({
          trigger: "department_low",
          department: dept.department,
          recipient: to,
          driverId: driver.id,
          surveyResponseId: response.id,
          sendResult: deptSend,
        });
      }
      alerts.push({
        to: deptSend.deliveredTo || primaryTo,
        intendedTo: deptSend.intendedTo || primaryTo,
        cc: ccList,
        department: dept.department,
        mocked: deptSend.mocked,
        testing: deptSend.testing,
      });
    }
  }

  let googleChat: unknown = null;
  if (branch === "positive" && driver) {
    const { notifyPositiveSurveyToGoogleChat } = await import("./googleChat");
    googleChat = await notifyPositiveSurveyToGoogleChat({
      driverName: driver.name,
      driverId: driver.id,
      overallRating,
      generalComment,
      dispatcher: driver.dispatcher,
    });
    const chatResult = googleChat as {
      sent?: boolean;
      skipped?: boolean;
      failed?: boolean;
    };
    if (!chatResult?.skipped) {
      await retentionStore.addNotificationLog({
        trigger: "positive_celebrate_chat",
        recipient: "google_chat",
        driverId: driver.id,
        surveyResponseId: response.id,
        sendResult: googleChat,
      });
    }
    if (chatResult?.sent) {
      alerts.push({ channel: "google_chat", event: "celebrate" });
    }
  }

  await bustRetentionCaches(driver?.id);
  return {
    branch,
    response,
    retentionCase,
    alerts,
    googleChat,
    googleReviewUrl: branch === "positive" ? GOOGLE_REVIEW_URL : null,
    thankYou:
      branch === "positive"
        ? "Thank you! If you have a moment, please leave us a Google review."
        : "Thank you — your feedback was received. Our team will follow up.",
  };
}

async function submitResolutionSurvey(
  occurrence: SurveyOccurrence,
  payload: {
    generalComment?: string;
    resolutionFeedback?: {
      quickly: number;
      efficiently: number;
      effectively: number;
    };
    submittedBy?: "driver" | "admin";
  },
  submittedBy: "driver" | "admin"
) {
  const raw = payload.resolutionFeedback;
  const quickly = Number(raw?.quickly);
  const efficiently = Number(raw?.efficiently);
  const effectively = Number(raw?.effectively);
  for (const [label, n] of [
    ["quickly", quickly],
    ["efficiently", efficiently],
    ["effectively", effectively],
  ] as const) {
    if (!n || n < 1 || n > 5) {
      const err = new Error(`Missing 1-5 rating for ${label}`);
      (err as Error & { status?: number }).status = 400;
      throw err;
    }
  }
  const resolutionFeedback = { quickly, efficiently, effectively };
  const overallRating = Math.round(
    (quickly + efficiently + effectively) / 3
  );
  const generalComment = String(payload.generalComment || "").trim();

  const response = await retentionStore.createSurveyResponse({
    driverId: occurrence.driverId,
    surveyOccurrenceId: occurrence.id,
    overallRating,
    generalComment,
    departmentFeedback: [],
    resolutionFeedback,
    branch: "positive",
    submittedBy,
  });
  await retentionStore.updateSurveyOccurrence(occurrence.id, {
    responseState: "completed",
    completedAt: new Date().toISOString(),
  });
  await bustRetentionCaches(occurrence.driverId);
  return {
    branch: "positive" as const,
    response,
    retentionCase: null,
    alerts: [],
    googleChat: null,
    googleReviewUrl: null,
    thankYou: "Thank you — your resolution feedback was received.",
  };
}

export type ResponsesListFilter = "all" | "pending" | "completed" | "non_response";

export type ResponsesListItem = {
  id: string;
  kind: "response" | "pending" | "non_response";
  date: string;
  driverId: string;
  driverName: string;
  overallRating: number | null;
  department: string | null;
  departmentRatings: { department: string; rating: number }[];
  status: string;
  comment: string;
  /** Who submitted a completed response (driver SMS vs admin test). */
  submittedBy?: "driver" | "admin";
  /** Survey SMS reminders sent for this occurrence (pending / non_response rows). */
  reminderCount?: number;
};

function mapPendingItem(
  o: SurveyOccurrence,
  driverNameById: Map<string, string>
): ResponsesListItem {
  return {
    id: o.id,
    kind: "pending",
    date: o.sentAt || o.updatedAt || o.createdAt,
    driverId: o.driverId,
    driverName: driverNameById.get(o.driverId) || o.driverId,
    overallRating: null,
    department: null,
    departmentRatings: [],
    status: o.responseState === "reminded" ? "Reminded" : "Pending",
    comment: "",
    reminderCount: o.reminderCount || 0,
  };
}

function mapNonResponseItem(
  o: SurveyOccurrence,
  driverNameById: Map<string, string>
): ResponsesListItem {
  return {
    id: o.id,
    kind: "non_response",
    date: o.updatedAt || o.sentAt || o.createdAt,
    driverId: o.driverId,
    driverName: driverNameById.get(o.driverId) || o.driverId,
    overallRating: null,
    department: null,
    departmentRatings: [],
    status: "No response",
    comment: "",
    reminderCount: o.reminderCount || 0,
  };
}

function mapResponseItem(
  r: SurveyResponse,
  driverNameById: Map<string, string>,
  casesByDriver: Map<string, { atRisk: boolean; status: CaseStatus; updatedAt: string }[]>
): ResponsesListItem {
  const driverCases = casesByDriver.get(r.driverId) || [];
  const open =
    driverCases.find(
      (c) => c.status !== "Resolved" && c.status !== "Completed"
    ) ||
    [...driverCases].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ||
    null;
  const departmentRatings = DEPARTMENTS.map((department) => {
    const found = (r.departmentFeedback || []).find(
      (d) => d.department === department
    );
    return {
      department,
      rating: found?.rating && found.rating >= 1 ? found.rating : 0,
    };
  }).filter((d) => d.rating >= 1);

  let status: string;
  if (r.branch === "positive") {
    status = "Completed";
  } else if (open?.status) {
    // Prefer live case status (Open / In Progress / Resolved / Completed).
    status = open.status;
  } else {
    status = "At Risk";
  }

  return {
    id: r.id,
    kind: "response",
    date: r.submittedAt,
    driverId: r.driverId,
    driverName: driverNameById.get(r.driverId) || r.driverId,
    overallRating: r.overallRating,
    department:
      departmentRatings
        .filter((d) => d.rating <= 3)
        .sort((a, b) => a.rating - b.rating)[0]?.department || null,
    departmentRatings,
    status,
    comment: r.generalComment,
    submittedBy: r.submittedBy,
  };
}

function paginateItems<T>(
  list: T[],
  page: number,
  pageSize: number
): { slice: T[]; total: number; totalPages: number; safePage: number } {
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const slice = list.slice((safePage - 1) * pageSize, safePage * pageSize);
  return { slice, total, totalPages, safePage };
}

export async function getResponsesPage(opts: {
  page?: number;
  pageSize?: number;
  filter?: ResponsesListFilter;
  q?: string;
}) {
  await ensureDemoSeed();
  const page = Math.max(1, Number(opts.page) || 1);
  const pageSize = Math.min(100, Math.max(5, Number(opts.pageSize) || 20));
  const filter: ResponsesListFilter =
    opts.filter === "pending" ||
    opts.filter === "completed" ||
    opts.filter === "non_response"
      ? opts.filter
      : "all";
  const q = String(opts.q || "")
    .trim()
    .toLowerCase();

  const [drivers, allResponses, allOccurrences, allCases] = await Promise.all([
    getGpAdapter().listDrivers({ includeInactive: false }),
    retentionStore.listSurveyResponses(),
    retentionStore.listSurveyOccurrences(),
    retentionStore.listRetentionCases(),
  ]);

  const activeIds = new Set(drivers.map((d) => d.id));
  const resolutionOccIds = new Set(
    allOccurrences
      .filter((o) => o.surveyKind === "resolution")
      .map((o) => o.id)
  );
  const driverNameById = new Map(drivers.map((d) => [d.id, d.name]));
  const casesByDriver = new Map<string, (typeof allCases)[number][]>();
  for (const c of allCases) {
    if (!activeIds.has(c.driverId)) continue;
    const bucket = casesByDriver.get(c.driverId);
    if (bucket) bucket.push(c);
    else casesByDriver.set(c.driverId, [c]);
  }

  const pendingItems = allOccurrences
    .filter(
      (o) =>
        activeIds.has(o.driverId) &&
        (o.surveyKind || "regular") === "regular" &&
        (o.responseState === "sent" || o.responseState === "reminded")
    )
    .sort((a, b) => {
      const da = a.sentAt || a.updatedAt || a.createdAt;
      const db = b.sentAt || b.updatedAt || b.createdAt;
      return db.localeCompare(da);
    })
    .map((o) => mapPendingItem(o, driverNameById));

  const nonResponseItems = allOccurrences
    .filter(
      (o) =>
        activeIds.has(o.driverId) &&
        (o.surveyKind || "regular") === "regular" &&
        o.responseState === "non_response"
    )
    .sort((a, b) => {
      const da = a.updatedAt || a.sentAt || a.createdAt;
      const db = b.updatedAt || b.sentAt || b.createdAt;
      return db.localeCompare(da);
    })
    .map((o) => mapNonResponseItem(o, driverNameById));

  const completedItems = allResponses
    .filter(
      (r) =>
        activeIds.has(r.driverId) &&
        !resolutionOccIds.has(r.surveyOccurrenceId)
    )
    .slice()
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
    .map((r) => mapResponseItem(r, driverNameById, casesByDriver));

  let list: ResponsesListItem[];
  if (filter === "pending") {
    list = pendingItems;
  } else if (filter === "completed") {
    list = completedItems;
  } else if (filter === "non_response") {
    list = nonResponseItems;
  } else {
    list = [...completedItems, ...pendingItems, ...nonResponseItems].sort(
      (a, b) => b.date.localeCompare(a.date)
    );
  }

  if (q) {
    list = list.filter((item) => matchesResponseSearch(item, q));
  }

  const { slice, total, totalPages, safePage } = paginateItems(
    list,
    page,
    pageSize
  );

  return {
    filter,
    page: safePage,
    pageSize,
    total,
    totalPages,
    query: q,
    items: slice,
  };
}

function matchesResponseSearch(item: ResponsesListItem, q: string) {
  if (item.driverName.toLowerCase().includes(q)) return true;
  if (item.driverId.toLowerCase().includes(q)) return true;
  if (item.status.toLowerCase().includes(q)) return true;
  if (item.comment.toLowerCase().includes(q)) return true;
  if ((item.department || "").toLowerCase().includes(q)) return true;
  if (
    item.departmentRatings.some(
      (d) =>
        d.department.toLowerCase().includes(q) || String(d.rating).includes(q)
    )
  ) {
    return true;
  }
  if (
    item.overallRating != null &&
    String(item.overallRating).includes(q)
  ) {
    return true;
  }
  return false;
}

export async function updateCaseStatus(caseId: string, status: CaseStatus) {
  await ensureDemoSeed();
  const allowed: CaseStatus[] = ["Open", "In Progress", "Resolved", "Completed"];
  if (!allowed.includes(status)) {
    const err = new Error(`status must be one of ${allowed.join(", ")}`);
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  const updated = await retentionStore.updateRetentionCase(caseId, {
    status,
    atRisk: status !== "Resolved" && status !== "Completed",
  });
  if (!updated) {
    const err = new Error("Case not found");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  await bustRetentionCaches(updated.driverId);

  let resolutionSurvey: unknown = null;
  if (status === "Resolved" || status === "Completed") {
    try {
      resolutionSurvey = await sendResolutionSurvey(
        updated.driverId,
        updated.id,
        "system"
      );
    } catch (e) {
      console.warn(
        "[retention] resolution survey after resolve:",
        (e as Error).message
      );
      resolutionSurvey = { skipped: true, reason: (e as Error).message };
    }
  }

  return { ...updated, resolutionSurvey };
}

export async function addNote(input: {
  driverId: string;
  caseId?: string;
  author?: string;
  text: string;
}) {
  await ensureDemoSeed();
  if (!String(input.text || "").trim()) {
    const err = new Error("Note text is required");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  const note = await retentionStore.addInternalNote({
    driverId: input.driverId,
    caseId: input.caseId || null,
    author: input.author || "Admin",
    text: String(input.text).trim(),
  });
  await bustRetentionCaches(input.driverId);
  return note;
}
