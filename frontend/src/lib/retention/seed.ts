import { nanoid } from "nanoid";
import { retentionStore } from "./store";

function daysAgoIso(n: number, hour = 10) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

/** Demo data so the dashboard matches the client mockup on first load. */
export function ensureDemoSeed() {
  if (retentionStore.isSeeded()) return;

  const michaelOcc = retentionStore.createSurveyOccurrence({
    driverId: "gp-drv-001",
    token: nanoid(24),
    scheduledAt: daysAgoIso(1),
    sentAt: daysAgoIso(1),
    completedAt: daysAgoIso(1, 11),
    triggeredBy: "system",
    responseState: "completed",
  });
  retentionStore.createSurveyResponse({
    driverId: "gp-drv-001",
    surveyOccurrenceId: michaelOcc.id,
    overallRating: 2,
    generalComment: "Excessive wait times at Dallas terminal and last-minute load changes.",
    departmentFeedback: [
      { department: "Dispatch", rating: 2, comment: "Load changes without notice." },
      { department: "Safety", rating: 4 },
      { department: "Accounting", rating: 3, comment: "Payroll questions unanswered." },
      { department: "Maintenance", rating: 3 },
    ],
    branch: "at_risk",
    submittedAt: daysAgoIso(1, 11),
  });
  const michaelCase = retentionStore.upsertRetentionCase("gp-drv-001", {
    atRisk: true,
    status: "Open",
    overallRating: 2,
    sourceSurveyId: michaelOcc.id,
  });
  retentionStore.addInternalNote({
    driverId: "gp-drv-001",
    caseId: michaelCase.id,
    author: "Eric Wilson",
    text: "Spoke with Michael about Dallas dwell times. Coordinating with terminal manager.",
    createdAt: daysAgoIso(1, 14),
  });
  retentionStore.addInternalNote({
    driverId: "gp-drv-001",
    caseId: michaelCase.id,
    author: "Art Lopez",
    text: "Dispatch coach scheduled for Friday. Monitoring load assignment quality.",
    createdAt: daysAgoIso(0, 9),
  });

  const saraOcc = retentionStore.createSurveyOccurrence({
    driverId: "gp-drv-002",
    token: nanoid(24),
    scheduledAt: daysAgoIso(2),
    sentAt: daysAgoIso(2),
    completedAt: daysAgoIso(2, 12),
    triggeredBy: "system",
    responseState: "completed",
  });
  retentionStore.createSurveyResponse({
    driverId: "gp-drv-002",
    surveyOccurrenceId: saraOcc.id,
    overallRating: 5,
    generalComment: "Great support this month.",
    departmentFeedback: [],
    branch: "positive",
    submittedAt: daysAgoIso(2, 12),
  });

  const jamesOcc = retentionStore.createSurveyOccurrence({
    driverId: "gp-drv-003",
    token: nanoid(24),
    scheduledAt: daysAgoIso(3),
    sentAt: daysAgoIso(3),
    completedAt: daysAgoIso(3, 15),
    triggeredBy: "system",
    responseState: "completed",
  });
  retentionStore.createSurveyResponse({
    driverId: "gp-drv-003",
    surveyOccurrenceId: jamesOcc.id,
    overallRating: 3,
    generalComment: "Truck downtime lasted too long.",
    departmentFeedback: [
      { department: "Dispatch", rating: 4 },
      { department: "Safety", rating: 4 },
      { department: "Accounting", rating: 4 },
      { department: "Maintenance", rating: 2, comment: "Shop backlog." },
    ],
    branch: "at_risk",
    submittedAt: daysAgoIso(3, 15),
  });
  retentionStore.upsertRetentionCase("gp-drv-003", {
    atRisk: true,
    status: "In Progress",
    overallRating: 3,
    sourceSurveyId: jamesOcc.id,
  });

  const danaOcc = retentionStore.createSurveyOccurrence({
    driverId: "gp-drv-006",
    token: nanoid(24),
    scheduledAt: daysAgoIso(4),
    sentAt: daysAgoIso(4),
    completedAt: daysAgoIso(4, 10),
    triggeredBy: "system",
    responseState: "completed",
  });
  retentionStore.createSurveyResponse({
    driverId: "gp-drv-006",
    surveyOccurrenceId: danaOcc.id,
    overallRating: 4,
    generalComment: "",
    departmentFeedback: [],
    branch: "positive",
    submittedAt: daysAgoIso(4, 10),
  });

  const robertOcc = retentionStore.createSurveyOccurrence({
    driverId: "gp-drv-007",
    token: nanoid(24),
    scheduledAt: daysAgoIso(5),
    sentAt: daysAgoIso(5),
    completedAt: daysAgoIso(5, 16),
    triggeredBy: "system",
    responseState: "completed",
  });
  retentionStore.createSurveyResponse({
    driverId: "gp-drv-007",
    surveyOccurrenceId: robertOcc.id,
    overallRating: 1,
    generalComment: "Safety briefing conflicted with dispatch timeline.",
    departmentFeedback: [
      { department: "Dispatch", rating: 3, comment: "Tight windows." },
      { department: "Safety", rating: 1, comment: "Last-minute training call." },
      { department: "Accounting", rating: 4 },
      { department: "Maintenance", rating: 4 },
    ],
    branch: "at_risk",
    submittedAt: daysAgoIso(5, 16),
  });
  const robertCase = retentionStore.upsertRetentionCase("gp-drv-007", {
    atRisk: false,
    status: "Completed",
    overallRating: 1,
    sourceSurveyId: robertOcc.id,
  });
  retentionStore.updateRetentionCase(robertCase.id, { status: "Completed", atRisk: false });

  const elenaOcc = retentionStore.createSurveyOccurrence({
    driverId: "gp-drv-008",
    token: nanoid(24),
    scheduledAt: daysAgoIso(1, 8),
    sentAt: daysAgoIso(1, 8),
    triggeredBy: "system",
    responseState: "sent",
  });
  void elenaOcc;

  // Pending surveys for KPI
  retentionStore.createSurveyOccurrence({
    driverId: "gp-drv-006",
    token: nanoid(24),
    scheduledAt: daysAgoIso(0, 8),
    sentAt: daysAgoIso(0, 8),
    triggeredBy: "system",
    responseState: "sent",
  });

  retentionStore.markSeeded();
}
