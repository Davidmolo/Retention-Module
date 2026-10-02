export const DETENTION_STATUSES = [
  "New",
  "Pending POD",
  "Docs Pending",
  "Submitted",
  "Approved",
  "Paid",
  "Denied",
] as const;

export type DetentionStatus = (typeof DETENTION_STATUSES)[number];

export type DetentionHistoryEvent = {
  type: string;
  timestamp: string;
  user?: string;
  text?: string;
  field?: string;
  from?: string;
  to?: string;
};

export type Detention = {
  id: string;
  customer: string | null;
  customerEmail: string | null;
  dispatcher: string | null;
  loadNumber: string | null;
  shipmentNumber: string | null;
  driverName: string | null;
  driverNumber: string | null;
  truckNumber: string | null;
  stopType: string | null;
  puLocation: string | null;
  puAppt: string | null;
  delLocation: string | null;
  delAppt: string | null;
  arrivalTime: string | null;
  detentionStart: string | null;
  driverDeparture: string | null;
  detentionMins: number | null;
  detentionTimeLabel: string | null;
  ratePerHour: number;
  amount: number | null;
  billableAmount: number | null;
  settledAmount: number | null;
  status: DetentionStatus | string;
  awaitingUs: boolean;
  followUpDate: string | null;
  loadLink: string | null;
  threadUrl: string | null;
  messageId: string | null;
  threadId: string | null;
  calendarEventId: string | null;
  emailDate: string | null;
  lastReplyFrom: string | null;
  lastReplyAt: string | null;
  history: DetentionHistoryEvent[];
  source: string;
  createdAt: string;
  updatedAt: string;
};

export type DetentionNote = {
  id: number;
  detentionId: string;
  author: string | null;
  body: string;
  createdAt: string;
};

export type DetentionListItem = Detention & {
  noteCount: number;
};

export type DetentionKpis = {
  total: number;
  open: number;
  awaitingUs: number;
  followUpDue: number;
  paid: number;
  openAmount: number;
};

export const DEFAULT_RATE_PER_HOUR = 25;
/** Ignore new email intake under this dollar amount (Art's rule). */
export const MIN_BILLABLE_AMOUNT = 50;

export function isDetentionStatus(value: string): value is DetentionStatus {
  return (DETENTION_STATUSES as readonly string[]).includes(value);
}

export function computeAmountFromMins(
  mins: number | null | undefined,
  ratePerHour = DEFAULT_RATE_PER_HOUR
): number | null {
  if (mins == null || !Number.isFinite(mins) || mins <= 0) return null;
  return Math.round((mins / 60) * ratePerHour * 100) / 100;
}
