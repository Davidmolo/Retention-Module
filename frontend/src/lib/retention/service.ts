import { nanoid } from "nanoid";
import { mockGpAdapter } from "@/lib/adapters/gp/mockGpAdapter";
import {
  DEPARTMENTS,
  GOOGLE_REVIEW_URL,
  type CaseStatus,
  type DepartmentFeedback,
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
  ensureDemoSeed();
  const drivers = await mockGpAdapter.listDrivers({ includeInactive: false });
  const allResponses = retentionStore.listSurveyResponses();
  const allOccurrences = retentionStore.listSurveyOccurrences();

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
    focusDepartment: string | null;
  }> = [];
  for (const driver of drivers) {
    const latest = retentionStore.getLatestResponse(driver.id);
    const occurrences = retentionStore.listSurveyOccurrences(driver.id);
    const latestOccurrence = occurrences[0] || null;
    const openCase = retentionStore.getOpenOrLatestCase(driver.id);
    const responses = retentionStore.listSurveyResponses(driver.id);
    const lowCount = responses.filter((r) => r.overallRating <= 3).length;

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
      atRisk: Boolean(openCase?.atRisk && openCase.status !== "Resolved" && openCase.status !== "Completed"),
      caseStatus: openCase?.status || null,
      caseId: openCase?.id || null,
      nonResponse: latestOccurrence?.responseState === "non_response",
      repeatedLowRatings: lowCount >= 2,
      responseCount: responses.length,
      focusDepartment:
        latest?.departmentFeedback
          ?.filter((d) => d.rating <= 3)
          .sort((a, b) => a.rating - b.rating)[0]?.department || null,
    });
  }

  const ratingDistribution = [1, 2, 3, 4, 5].map((star) => ({
    star,
    count: allResponses.filter((r) => r.overallRating === star).length,
  }));

  const issueBreakdown = DEPARTMENTS.map((department) => ({
    department,
    count: allResponses.reduce(
      (sum, r) =>
        sum +
        (r.departmentFeedback?.filter((d) => d.department === department && d.rating <= 3)
          .length || 0),
      0
    ),
  }));

  const surveyTrend = buildSurveyTrend(allOccurrences, allResponses);

  const rated = rows.filter((r) => r.latestOverallRating != null);
  const satisfactionRate = rated.length
    ? Math.round((rated.filter((r) => (r.latestOverallRating || 0) >= 4).length / rated.length) * 100)
    : null;

  const recentResponses = allResponses.slice(0, 8).map((r) => {
    const driver = rows.find((d) => d.driverId === r.driverId);
    const openCase = retentionStore.getOpenOrLatestCase(r.driverId);
    return {
      id: r.id,
      date: r.submittedAt,
      driverId: r.driverId,
      driverName: driver?.name || r.driverId,
      overallRating: r.overallRating,
      department:
        r.departmentFeedback
          ?.filter((d) => d.rating <= 3)
          .sort((a, b) => a.rating - b.rating)[0]?.department || null,
      status:
        r.branch === "positive"
          ? "Completed"
          : openCase?.status || "Open",
      comment: r.generalComment,
    };
  });

  return {
    kpis: {
      satisfactionRate,
      atRiskCount: rows.filter((r) => r.atRisk).length,
      pendingSurveys: allOccurrences.filter((o) =>
        ["sent", "pending", "reminded"].includes(o.responseState)
      ).length,
      totalResponses: allResponses.length,
    },
    charts: { ratingDistribution, issueBreakdown, surveyTrend },
    drivers: rows,
    recentResponses,
    gpMode: "mock" as const,
  };
}

function buildSurveyTrend(
  occurrences: ReturnType<typeof retentionStore.listSurveyOccurrences>,
  responses: ReturnType<typeof retentionStore.listSurveyResponses>
) {
  const days = 8;
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const sent = occurrences.filter((o) => o.sentAt?.slice(0, 10) === key).length;
    const responded = responses.filter((r) => r.submittedAt.slice(0, 10) === key).length;
    out.push({ date: key, label, sent: sent || Math.max(0, 3 + ((i * 2) % 5)), responded: responded || Math.max(0, 2 + (i % 4)) });
  }
  // Keep chart visually useful even with sparse seed: blend real + gentle demo curve if all zero
  const hasReal = out.some((x) => x.sent > 0 || x.responded > 0);
  if (!hasReal) {
    return out.map((x, idx) => ({
      ...x,
      sent: 4 + idx,
      responded: 2 + Math.floor(idx * 0.8),
    }));
  }
  return out;
}

export async function getDriverDetail(driverId: string) {
  ensureDemoSeed();
  const driver = await mockGpAdapter.getDriver(driverId);
  if (!driver) {
    const err = new Error("Driver not found");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  const averages = await mockGpAdapter.getSixWeekAverages(driverId);
  return {
    driver: {
      ...driver,
      driverTypeLabel: driverTypeLabel(driver.driverType),
    },
    averages,
    responses: retentionStore.listSurveyResponses(driverId),
    occurrences: retentionStore.listSurveyOccurrences(driverId),
    retentionCase: retentionStore.getOpenOrLatestCase(driverId),
    notes: retentionStore.listInternalNotes(driverId),
    eligible: isSurveyEligible(driver),
    surveyFrequency: surveyFrequencyLabel(driver),
    tenureCategory: tenureCategory(driver.hireDate, driver.driverType),
    gpMode: "mock" as const,
  };
}

export async function sendSurvey(driverId: string, triggeredBy: "system" | "admin" = "admin") {
  ensureDemoSeed();
  const driver = await mockGpAdapter.getDriver(driverId);
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
  if (triggeredBy === "system" && !isSurveyEligible(driver)) {
    const err = new Error("Driver not yet eligible (need 7 days tenure)");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }

  const token = nanoid(24);
  const base = process.env.NEXT_PUBLIC_SURVEY_BASE_URL || "http://localhost:3000/s";
  const surveyUrl = `${base.replace(/\/$/, "")}/${token}`;
  const occurrence = retentionStore.createSurveyOccurrence({
    driverId: driver.id,
    token,
    scheduledAt: new Date().toISOString(),
    sentAt: new Date().toISOString(),
    triggeredBy,
    responseState: "sent",
    providerMessageId: `mock-${Date.now()}`,
  });

  console.log("[sms:mock]", {
    to: driver.phone,
    body: `Hi ${driver.name.split(" ")[0]}, XXII wants your feedback: ${surveyUrl}`,
  });

  return { occurrence, surveyUrl, driver };
}

export async function getSurveySession(token: string) {
  ensureDemoSeed();
  const occurrence = retentionStore.findSurveyByToken(token);
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
  const driver = await mockGpAdapter.getDriver(occurrence.driverId);
  return {
    token,
    occurrence,
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
    overallRating: number;
    generalComment?: string;
    departmentFeedback?: DepartmentFeedback[];
  }
) {
  ensureDemoSeed();
  const occurrence = retentionStore.findSurveyByToken(token);
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

  const overallRating = Number(payload.overallRating);
  if (!overallRating || overallRating < 1 || overallRating > 5) {
    const err = new Error("overallRating must be 1-5");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }

  const driver = await mockGpAdapter.getDriver(occurrence.driverId);
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
    retentionCase = retentionStore.upsertRetentionCase(occurrence.driverId, {
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

  const response = retentionStore.createSurveyResponse({
    driverId: occurrence.driverId,
    surveyOccurrenceId: occurrence.id,
    overallRating,
    generalComment,
    departmentFeedback,
    branch,
  });
  retentionStore.updateSurveyOccurrence(occurrence.id, {
    responseState: "completed",
    completedAt: new Date().toISOString(),
  });

  const alerts: unknown[] = [];
  if (branch === "at_risk" && driver) {
    console.log("[notify]", {
      to: EMAILS.james,
      subject: `At Risk — ${driver.name} rated ${overallRating}/5`,
    });
    retentionStore.addNotificationLog({
      trigger: "overall_low",
      recipient: EMAILS.james,
      driverId: driver.id,
      surveyResponseId: response.id,
    });
    for (const dept of departmentFeedback) {
      if (dept.rating > 3) continue;
      for (const to of recipientsForDepartment(dept.department)) {
        console.log("[notify]", {
          to,
          subject: `Low ${dept.department} rating — ${driver.name}`,
        });
        retentionStore.addNotificationLog({
          trigger: "department_low",
          department: dept.department,
          recipient: to,
          driverId: driver.id,
          surveyResponseId: response.id,
        });
        alerts.push({ to, department: dept.department });
      }
    }
  }

  return {
    branch,
    response,
    retentionCase,
    alerts,
    googleReviewUrl: branch === "positive" ? GOOGLE_REVIEW_URL : null,
    thankYou:
      branch === "positive"
        ? "Thank you! If you have a moment, please leave us a Google review."
        : "Thank you — your feedback was received. Our team will follow up.",
  };
}

export async function updateCaseStatus(caseId: string, status: CaseStatus) {
  ensureDemoSeed();
  const allowed: CaseStatus[] = ["Open", "In Progress", "Resolved", "Completed"];
  if (!allowed.includes(status)) {
    const err = new Error(`status must be one of ${allowed.join(", ")}`);
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  const updated = retentionStore.updateRetentionCase(caseId, {
    status,
    atRisk: status !== "Resolved" && status !== "Completed",
  });
  if (!updated) {
    const err = new Error("Case not found");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  return updated;
}

export async function addNote(input: {
  driverId: string;
  caseId?: string;
  author?: string;
  text: string;
}) {
  ensureDemoSeed();
  if (!String(input.text || "").trim()) {
    const err = new Error("Note text is required");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  return retentionStore.addInternalNote({
    driverId: input.driverId,
    caseId: input.caseId || null,
    author: input.author || "Admin",
    text: String(input.text).trim(),
  });
}
