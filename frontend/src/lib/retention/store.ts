import { nanoid } from "nanoid";
import type {
  CaseStatus,
  InternalNote,
  NotificationLog,
  RetentionCase,
  SurveyOccurrence,
  SurveyResponse,
} from "./types";

type State = {
  surveyOccurrences: SurveyOccurrence[];
  surveyResponses: SurveyResponse[];
  retentionCases: RetentionCase[];
  internalNotes: InternalNote[];
  notificationLogs: NotificationLog[];
  optOuts: { id: string; phone: string; optedOut: boolean; source: string; updatedAt: string }[];
  seeded: boolean;
};

declare global {
  var __retentionStore: State | undefined;
}

function blankState(): State {
  return {
    surveyOccurrences: [],
    surveyResponses: [],
    retentionCases: [],
    internalNotes: [],
    notificationLogs: [],
    optOuts: [],
    seeded: false,
  };
}

function getState(): State {
  if (!globalThis.__retentionStore) {
    globalThis.__retentionStore = blankState();
  }
  return globalThis.__retentionStore;
}

function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export const retentionStore = {
  reset() {
    globalThis.__retentionStore = blankState();
  },

  isSeeded() {
    return getState().seeded;
  },

  markSeeded() {
    getState().seeded = true;
  },

  createSurveyOccurrence(
    data: Omit<SurveyOccurrence, "id" | "createdAt" | "updatedAt" | "reminderCount"> & {
      reminderCount?: number;
    }
  ) {
    const row: SurveyOccurrence = {
      id: nanoid(),
      reminderCount: data.reminderCount ?? 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...data,
    };
    getState().surveyOccurrences.push(row);
    return clone(row);
  },

  updateSurveyOccurrence(idOrToken: string, patch: Partial<SurveyOccurrence>) {
    const row = getState().surveyOccurrences.find(
      (s) => s.id === idOrToken || s.token === idOrToken
    );
    if (!row) return null;
    Object.assign(row, patch, { updatedAt: new Date().toISOString() });
    return clone(row);
  },

  findSurveyByToken(token: string) {
    const row = getState().surveyOccurrences.find((s) => s.token === token);
    return row ? clone(row) : null;
  },

  listSurveyOccurrences(driverId?: string) {
    return getState()
      .surveyOccurrences.filter((s) => !driverId || s.driverId === driverId)
      .map(clone)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  createSurveyResponse(data: Omit<SurveyResponse, "id" | "submittedAt"> & { submittedAt?: string }) {
    const row: SurveyResponse = {
      id: nanoid(),
      submittedAt: data.submittedAt || new Date().toISOString(),
      ...data,
    };
    getState().surveyResponses.push(row);
    return clone(row);
  },

  listSurveyResponses(driverId?: string) {
    return getState()
      .surveyResponses.filter((r) => !driverId || r.driverId === driverId)
      .map(clone)
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  },

  getLatestResponse(driverId: string) {
    return this.listSurveyResponses(driverId)[0] || null;
  },

  upsertRetentionCase(driverId: string, patch: Partial<RetentionCase> = {}) {
    const state = getState();
    let row = state.retentionCases.find((c) => c.driverId === driverId && c.status !== "Resolved" && c.status !== "Completed");
    if (!row) {
      row = {
        id: nanoid(),
        driverId,
        atRisk: true,
        status: "Open",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        resolvedAt: null,
      };
      state.retentionCases.push(row);
    }
    Object.assign(row, patch, { updatedAt: new Date().toISOString() });
    if (patch.status === "Resolved" || patch.status === "Completed") {
      row.resolvedAt = new Date().toISOString();
      row.atRisk = false;
    }
    return clone(row);
  },

  getOpenOrLatestCase(driverId: string) {
    const open = getState().retentionCases.find(
      (c) => c.driverId === driverId && c.status !== "Resolved" && c.status !== "Completed"
    );
    if (open) return clone(open);
    const all = getState()
      .retentionCases.filter((c) => c.driverId === driverId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return all[0] ? clone(all[0]) : null;
  },

  listRetentionCases() {
    return getState().retentionCases.map(clone);
  },

  updateRetentionCase(caseId: string, patch: Partial<RetentionCase>) {
    const row = getState().retentionCases.find((c) => c.id === caseId);
    if (!row) return null;
    Object.assign(row, patch, { updatedAt: new Date().toISOString() });
    if (patch.status === "Resolved" || patch.status === "Completed") {
      row.resolvedAt = new Date().toISOString();
      row.atRisk = false;
    }
    return clone(row);
  },

  addInternalNote(data: Omit<InternalNote, "id" | "createdAt"> & { createdAt?: string }) {
    const row: InternalNote = {
      id: nanoid(),
      createdAt: data.createdAt || new Date().toISOString(),
      ...data,
    };
    getState().internalNotes.push(row);
    return clone(row);
  },

  listInternalNotes(driverId: string) {
    return getState()
      .internalNotes.filter((n) => n.driverId === driverId)
      .map(clone)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  addNotificationLog(data: Omit<NotificationLog, "id" | "createdAt">) {
    const row: NotificationLog = {
      id: nanoid(),
      createdAt: new Date().toISOString(),
      ...data,
    };
    getState().notificationLogs.push(row);
    return clone(row);
  },

  isOptedOut(phone: string) {
    return getState().optOuts.some((o) => o.phone === phone && o.optedOut);
  },
};

export type { CaseStatus };
