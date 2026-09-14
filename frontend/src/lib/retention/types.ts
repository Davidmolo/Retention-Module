export type CaseStatus = "Open" | "In Progress" | "Resolved" | "Completed";
export type Department = "Dispatch" | "Safety" | "Accounting" | "Maintenance";

export type DepartmentFeedback = {
  department: Department;
  rating: number;
  comment?: string;
};

export type SurveyOccurrence = {
  id: string;
  driverId: string;
  token: string;
  scheduledAt: string;
  sentAt?: string;
  completedAt?: string;
  triggeredBy: "system" | "admin";
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
  branch: "positive" | "at_risk";
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
