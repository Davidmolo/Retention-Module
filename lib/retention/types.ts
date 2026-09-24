export type CaseStatus = "Open" | "In Progress" | "Resolved" | "Completed";
export type Department = "Dispatch" | "Safety" | "Accounting" | "Maintenance";

export type DepartmentFeedback = {
  department: Department;
  rating: number;
  comment?: string;
};

export type SurveyKind = "regular" | "resolution";

export type ResolutionFeedback = {
  quickly: number;
  efficiently: number;
  effectively: number;
};

export type SurveyOccurrence = {
  id: string;
  driverId: string;
  token: string;
  scheduledAt: string;
  sentAt?: string;
  completedAt?: string;
  triggeredBy: "system" | "admin";
  /** Regular cadence/manual vs post-resolve follow-up. */
  surveyKind: SurveyKind;
  /** Case this resolution survey belongs to (resolution kind only). */
  caseId?: string | null;
  responseState: "pending" | "sent" | "reminded" | "completed" | "non_response";
  reminderCount: number;
  providerMessageId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SurveyResponse = {
  id: string;
  driverId: string;
  surveyOccurrenceId: string;
  overallRating: number;
  generalComment: string;
  departmentFeedback: DepartmentFeedback[];
  /** Present when the linked occurrence is a resolution follow-up. */
  resolutionFeedback?: ResolutionFeedback | null;
  branch: "positive" | "at_risk";
  /** Who submitted: real driver (SMS) vs admin testing from driver detail. */
  submittedBy: "driver" | "admin";
  submittedAt: string;
};

export type RetentionCase = {
  id: string;
  driverId: string;
  atRisk: boolean;
  status: CaseStatus;
  sourceSurveyId?: string;
  overallRating?: number;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string | null;
};

export type InternalNote = {
  id: string;
  driverId: string;
  caseId?: string | null;
  author: string;
  text: string;
  createdAt: string;
};

export type NotificationLog = {
  id: string;
  trigger: string;
  recipient: string;
  department?: string;
  driverId?: string;
  surveyResponseId?: string;
  sendResult?: unknown;
  createdAt: string;
};

export const DEPARTMENTS: Department[] = [
  "Dispatch",
  "Safety",
  "Accounting",
  "Maintenance",
];

export const GOOGLE_REVIEW_URL =
  process.env.NEXT_PUBLIC_GOOGLE_REVIEW_URL ||
  "https://g.page/r/CVMneYort2cZEBM/review";
