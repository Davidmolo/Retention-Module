import { nanoid } from "nanoid";
import { retentionStore } from "./store";
import type { DepartmentFeedback } from "./types";

/** Bump this when seed content changes so hot-reload picks up new demo data. */
export const DEMO_SEED_VERSION = 2;

function daysAgoIso(n: number, hour = 10) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

async function addCompletedSurvey(opts: {
  driverId: string;
  daysAgo: number;
  hour?: number;
  overallRating: number;
  generalComment: string;
  departmentFeedback?: DepartmentFeedback[];
  branch?: "positive" | "at_risk";
}) {
  const hour = opts.hour ?? 11;
  const branch =
    opts.branch ?? (opts.overallRating <= 3 ? "at_risk" : "positive");
  const occ = await retentionStore.createSurveyOccurrence({
    driverId: opts.driverId,
    token: nanoid(24),
    scheduledAt: daysAgoIso(opts.daysAgo, hour - 1),
    sentAt: daysAgoIso(opts.daysAgo, hour - 1),
    completedAt: daysAgoIso(opts.daysAgo, hour),
    triggeredBy: "system",
    responseState: "completed",
  });
  await retentionStore.createSurveyResponse({
    driverId: opts.driverId,
    surveyOccurrenceId: occ.id,
    overallRating: opts.overallRating,
    generalComment: opts.generalComment,
    departmentFeedback: opts.departmentFeedback ?? [],
    branch,
    submittedBy: "driver",
    submittedAt: daysAgoIso(opts.daysAgo, hour),
  });
  return occ;
}

/**
 * Optional fake surveys/cases for UI demos without a DB.
 * Disabled by default — live Retention must show real MySQL data only.
 * Set RETENTION_DEMO_SEED=1 and GP_ADAPTER=mock to enable.
 */
export async function ensureDemoSeed() {
  const adapter = (process.env.GP_ADAPTER || "live").toLowerCase();
  const allowSeed = process.env.RETENTION_DEMO_SEED === "1";
  if (adapter === "live" || !allowSeed) return;
  if ((await retentionStore.getSeedVersion()) === DEMO_SEED_VERSION) return;
  await retentionStore.reset();

  // ——— Michael Torres: rich history for carousel + View all ———
  await addCompletedSurvey({
    driverId: "gp-drv-001",
    daysAgo: 1,
    overallRating: 2,
    generalComment:
      "Excessive wait times at Dallas terminal and last-minute load changes.",
    departmentFeedback: [
      { department: "Dispatch", rating: 2, comment: "Load changes without notice." },
      { department: "Safety", rating: 4 },
      { department: "Accounting", rating: 3, comment: "Payroll questions unanswered." },
      { department: "Maintenance", rating: 3 },
    ],
  });
  await addCompletedSurvey({
    driverId: "gp-drv-001",
    daysAgo: 14,
    overallRating: 3,
    generalComment: "Detention pay took too long to show on settlement.",
    departmentFeedback: [
      { department: "Dispatch", rating: 3 },
      { department: "Safety", rating: 4 },
      { department: "Accounting", rating: 2, comment: "Detention coding delays." },
      { department: "Maintenance", rating: 4 },
    ],
  });
  await addCompletedSurvey({
    driverId: "gp-drv-001",
    daysAgo: 28,
    overallRating: 4,
    generalComment: "Better week — home time honored.",
    departmentFeedback: [],
  });
  await addCompletedSurvey({
    driverId: "gp-drv-001",
    daysAgo: 45,
    overallRating: 2,
    generalComment: "Relay handoff was messy; sat overnight without update.",
    departmentFeedback: [
      { department: "Dispatch", rating: 1, comment: "No overnight update." },
      { department: "Safety", rating: 4 },
      { department: "Accounting", rating: 4 },
      { department: "Maintenance", rating: 3 },
    ],
  });
  await addCompletedSurvey({
    driverId: "gp-drv-001",
    daysAgo: 60,
    overallRating: 5,
    generalComment: "Dispatcher checked in mid-week. Felt supported.",
    departmentFeedback: [],
  });
  await addCompletedSurvey({
    driverId: "gp-drv-001",
    daysAgo: 75,
    overallRating: 3,
    generalComment: "Shop kept the truck longer than promised.",
    departmentFeedback: [
      { department: "Dispatch", rating: 4 },
      { department: "Safety", rating: 4 },
      { department: "Accounting", rating: 4 },
      { department: "Maintenance", rating: 2, comment: "ETA slipped twice." },
    ],
  });
  await addCompletedSurvey({
    driverId: "gp-drv-001",
    daysAgo: 90,
    overallRating: 4,
    generalComment: "Solid miles and clear communication.",
    departmentFeedback: [],
  });

  const michaelCase = await retentionStore.upsertRetentionCase("gp-drv-001", {
    atRisk: true,
    status: "Open",
    overallRating: 2,
    sourceSurveyId: undefined,
  });
  await retentionStore.addInternalNote({
    driverId: "gp-drv-001",
    caseId: michaelCase.id,
    author: "Eric Wilson",
    text: "Spoke with Michael about Dallas dwell times. Coordinating with terminal manager.",
    createdAt: daysAgoIso(1, 14),
  });
  await retentionStore.addInternalNote({
    driverId: "gp-drv-001",
    caseId: michaelCase.id,
    author: "Art Lopez",
    text: "Dispatch coach scheduled for Friday. Monitoring load assignment quality.",
    createdAt: daysAgoIso(0, 9),
  });

  // ——— Sara Nguyen ———
  await addCompletedSurvey({
    driverId: "gp-drv-002",
    daysAgo: 2,
    overallRating: 5,
    generalComment: "Great support this month.",
  });
  await addCompletedSurvey({
    driverId: "gp-drv-002",
    daysAgo: 32,
    overallRating: 4,
    generalComment: "Fuel advances were quick.",
  });
  await addCompletedSurvey({
    driverId: "gp-drv-002",
    daysAgo: 62,
    overallRating: 5,
    generalComment: "Would recommend XXII to other O/Os.",
  });

  // ——— James Carter ———
  await addCompletedSurvey({
    driverId: "gp-drv-003",
    daysAgo: 3,
    overallRating: 3,
    generalComment: "Truck downtime lasted too long.",
    departmentFeedback: [
      { department: "Dispatch", rating: 4 },
      { department: "Safety", rating: 4 },
      { department: "Accounting", rating: 4 },
      { department: "Maintenance", rating: 2, comment: "Shop backlog." },
    ],
  });
  await addCompletedSurvey({
    driverId: "gp-drv-003",
    daysAgo: 35,
    overallRating: 2,
    generalComment: "APU failed on the road; tow wait was long.",
    departmentFeedback: [
      { department: "Dispatch", rating: 3 },
      { department: "Safety", rating: 4 },
      { department: "Accounting", rating: 4 },
      { department: "Maintenance", rating: 1, comment: "Road service slow." },
    ],
  });
  await addCompletedSurvey({
    driverId: "gp-drv-003",
    daysAgo: 70,
    overallRating: 4,
    generalComment: "Issues resolved after last shop visit.",
  });
  await retentionStore.upsertRetentionCase("gp-drv-003", {
    atRisk: true,
    status: "In Progress",
    overallRating: 3,
  });

  // ——— Dana Brooks ———
  await addCompletedSurvey({
    driverId: "gp-drv-006",
    daysAgo: 4,
    overallRating: 4,
    generalComment: "Smooth week overall.",
  });
  await addCompletedSurvey({
    driverId: "gp-drv-006",
    daysAgo: 40,
    overallRating: 5,
    generalComment: "Home time matched what was promised.",
  });

  // ——— Robert Kim ———
  await addCompletedSurvey({
    driverId: "gp-drv-007",
    daysAgo: 5,
    overallRating: 1,
    generalComment: "Safety briefing conflicted with dispatch timeline.",
    departmentFeedback: [
      { department: "Dispatch", rating: 3, comment: "Tight windows." },
      { department: "Safety", rating: 1, comment: "Last-minute training call." },
      { department: "Accounting", rating: 4 },
      { department: "Maintenance", rating: 4 },
    ],
  });
  await addCompletedSurvey({
    driverId: "gp-drv-007",
    daysAgo: 40,
    overallRating: 3,
    generalComment: "HOS pressure on short-haul days.",
    departmentFeedback: [
      { department: "Dispatch", rating: 2, comment: "Tight appointments." },
      { department: "Safety", rating: 3 },
      { department: "Accounting", rating: 4 },
      { department: "Maintenance", rating: 4 },
    ],
  });
  await addCompletedSurvey({
    driverId: "gp-drv-007",
    daysAgo: 80,
    overallRating: 4,
    generalComment: "Felt better after schedule adjustment.",
  });
  const robertCase = await retentionStore.upsertRetentionCase("gp-drv-007", {
    atRisk: false,
    status: "Completed",
    overallRating: 1,
  });
  await retentionStore.updateRetentionCase(robertCase.id, {
    status: "Completed",
    atRisk: false,
  });

  // ——— Elena Vasquez: pending ———
  await retentionStore.createSurveyOccurrence({
    driverId: "gp-drv-008",
    token: nanoid(24),
    scheduledAt: daysAgoIso(1, 8),
    sentAt: daysAgoIso(1, 8),
    triggeredBy: "system",
    responseState: "sent",
  });
  await addCompletedSurvey({
    driverId: "gp-drv-008",
    daysAgo: 30,
    overallRating: 4,
    generalComment: "Good onboarding so far.",
  });
  await addCompletedSurvey({
    driverId: "gp-drv-008",
    daysAgo: 55,
    overallRating: 3,
    generalComment: "Still learning the app tools.",
    departmentFeedback: [
      { department: "Dispatch", rating: 3 },
      { department: "Safety", rating: 4 },
      { department: "Accounting", rating: 4 },
      { department: "Maintenance", rating: 4 },
    ],
  });

  // Extra pending for KPI
  await retentionStore.createSurveyOccurrence({
    driverId: "gp-drv-006",
    token: nanoid(24),
    scheduledAt: daysAgoIso(0, 8),
    sentAt: daysAgoIso(0, 8),
    triggeredBy: "system",
    responseState: "sent",
  });
  await retentionStore.createSurveyOccurrence({
    driverId: "gp-drv-002",
    token: nanoid(24),
    scheduledAt: daysAgoIso(0, 9),
    sentAt: daysAgoIso(0, 9),
    triggeredBy: "system",
    responseState: "reminded",
    reminderCount: 1,
  });

  // Priya — new hire, one early response
  await addCompletedSurvey({
    driverId: "gp-drv-004",
    daysAgo: 2,
    overallRating: 5,
    generalComment: "Orientation was clear. Feeling welcomed.",
  });

  await retentionStore.markSeeded(DEMO_SEED_VERSION);
}
