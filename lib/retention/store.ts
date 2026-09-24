import { nanoid } from "nanoid";
import type { RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import { normalizePhoneE164 } from "./sms";
import type {
  CaseStatus,
  DepartmentFeedback,
  InternalNote,
  NotificationLog,
  ResolutionFeedback,
  RetentionCase,
  SurveyKind,
  SurveyOccurrence,
  SurveyResponse,
} from "./types";

type SeedMeta = { seeded: boolean; seedVersion: number };

declare global {
  var __retentionSeedMeta: SeedMeta | undefined;
}

function getSeedMeta(): SeedMeta {
  if (!globalThis.__retentionSeedMeta) {
    globalThis.__retentionSeedMeta = { seeded: false, seedVersion: 0 };
  }
  return globalThis.__retentionSeedMeta;
}

/** ISO / Date → MySQL DATETIME(3) string, or null. */
function toDateTime(value: string | Date | null | undefined): string | null {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 23).replace("T", " ");
}

/** MySQL DATETIME / Date → ISO string. */
function fromDateTime(value: string | Date | null | undefined): string | undefined {
  if (value == null) return undefined;
  if (value instanceof Date) return value.toISOString();
  const normalized = String(value).includes("T")
    ? String(value)
    : String(value).replace(" ", "T");
  const d = new Date(normalized.endsWith("Z") ? normalized : `${normalized}Z`);
  if (Number.isNaN(d.getTime())) {
    const fallback = new Date(String(value));
    return Number.isNaN(fallback.getTime()) ? undefined : fallback.toISOString();
  }
  return d.toISOString();
}

function fromDateTimeRequired(value: string | Date | null | undefined): string {
  return fromDateTime(value) || new Date().toISOString();
}

/**
 * Write BIGINT: Number(driverId) for live numeric ids.
 * Mock seed ids like "gp-drv-001" map to their trailing number.
 */
function toDriverDbId(driverId: string): number {
  const n = Number(driverId);
  if (Number.isFinite(n)) return n;
  const m = /^gp-drv-0*(\d+)$/i.exec(driverId);
  if (m) return Number(m[1]);
  throw new Error(`Invalid retention driverId: ${driverId}`);
}

/** Read BIGINT back as string; restore gp-drv-NNN when not in live GP mode. */
function fromDriverDbId(id: unknown): string {
  const s = String(id);
  if ((process.env.GP_ADAPTER || "live").toLowerCase() === "live") {
    return s;
  }
  const n = Number(s);
  if (Number.isFinite(n)) {
    return `gp-drv-${String(n).padStart(3, "0")}`;
  }
  return s;
}

function parseDepartmentFeedback(raw: unknown): DepartmentFeedback[] {
  if (raw == null) return [];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as DepartmentFeedback[]) : [];
    } catch {
      return [];
    }
  }
  if (Array.isArray(raw)) return raw as DepartmentFeedback[];
  if (typeof raw === "object") return raw as DepartmentFeedback[];
  return [];
}

function parseResolutionFeedback(raw: unknown): ResolutionFeedback | null {
  if (raw == null) return null;
  let obj: Record<string, unknown> | null = null;
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  } else if (typeof raw === "object") {
    obj = raw as Record<string, unknown>;
  }
  if (!obj) return null;
  const quickly = Number(obj.quickly);
  const efficiently = Number(obj.efficiently);
  const effectively = Number(obj.effectively);
  if (
    ![quickly, efficiently, effectively].every((n) => n >= 1 && n <= 5)
  ) {
    return null;
  }
  return { quickly, efficiently, effectively };
}

function phoneDigitsLast10(phone: string): string {
  return String(phone || "").replace(/\D/g, "").slice(-10);
}

function mapSurveyOccurrence(row: RowDataPacket): SurveyOccurrence {
  const kind: SurveyKind =
    row.survey_kind === "resolution" ? "resolution" : "regular";
  return {
    id: String(row.id),
    driverId: fromDriverDbId(row.driver_id),
    token: String(row.token),
    scheduledAt: fromDateTimeRequired(row.scheduled_at),
    sentAt: fromDateTime(row.sent_at),
    completedAt: fromDateTime(row.completed_at),
    triggeredBy: row.triggered_by,
    surveyKind: kind,
    caseId: row.case_id != null ? String(row.case_id) : null,
    responseState: row.response_state,
    reminderCount: Number(row.reminder_count) || 0,
    providerMessageId: row.provider_message_id ?? null,
    createdAt: fromDateTimeRequired(row.created_at),
    updatedAt: fromDateTimeRequired(row.updated_at),
  };
}

function mapSurveyResponse(row: RowDataPacket): SurveyResponse {
  return {
    id: String(row.id),
    driverId: fromDriverDbId(row.driver_id),
    surveyOccurrenceId: String(row.survey_occurrence_id),
    overallRating: Number(row.overall_rating),
    generalComment: row.general_comment ?? "",
    departmentFeedback: parseDepartmentFeedback(row.department_feedback),
    resolutionFeedback: parseResolutionFeedback(row.resolution_feedback),
    branch: row.branch,
    submittedBy: row.submitted_by === "admin" ? "admin" : "driver",
    submittedAt: fromDateTimeRequired(row.submitted_at),
  };
}

function mapRetentionCase(row: RowDataPacket): RetentionCase {
  return {
    id: String(row.id),
    driverId: fromDriverDbId(row.driver_id),
    atRisk: Boolean(row.at_risk),
    status: row.status as CaseStatus,
    sourceSurveyId: row.source_survey_id ?? undefined,
    overallRating:
      row.overall_rating != null ? Number(row.overall_rating) : undefined,
    createdAt: fromDateTimeRequired(row.created_at),
    updatedAt: fromDateTimeRequired(row.updated_at),
    resolvedAt: row.resolved_at != null ? fromDateTime(row.resolved_at) ?? null : null,
  };
}

function mapInternalNote(row: RowDataPacket): InternalNote {
  return {
    id: String(row.id),
    driverId: fromDriverDbId(row.driver_id),
    caseId: row.case_id ?? null,
    author: String(row.author),
    text: String(row.body),
    createdAt: fromDateTimeRequired(row.created_at),
  };
}

function mapNotificationLog(row: RowDataPacket): NotificationLog {
  let sendResult: unknown;
  if (row.send_result != null) {
    if (typeof row.send_result === "string") {
      try {
        sendResult = JSON.parse(row.send_result);
      } catch {
        sendResult = row.send_result;
      }
    } else {
      sendResult = row.send_result;
    }
  }
  return {
    id: String(row.id),
    trigger: String(row.trigger_name),
    recipient: String(row.recipient),
    department: row.department ?? undefined,
    driverId: row.driver_id != null ? fromDriverDbId(row.driver_id) : undefined,
    surveyResponseId: row.survey_response_id ?? undefined,
    sendResult,
    createdAt: fromDateTimeRequired(row.created_at),
  };
}

export const retentionStore = {
  async reset() {
    const pool = getPool();
    await pool.query("DELETE FROM retention_notification_logs");
    await pool.query("DELETE FROM retention_internal_notes");
    await pool.query("DELETE FROM retention_survey_responses");
    await pool.query("DELETE FROM retention_survey_occurrences");
    await pool.query("DELETE FROM retention_cases");
    await pool.query("DELETE FROM retention_sms_opt_outs");
    globalThis.__retentionSeedMeta = { seeded: false, seedVersion: 0 };
  },

  async isSeeded() {
    return getSeedMeta().seeded;
  },

  async getSeedVersion() {
    return getSeedMeta().seedVersion;
  },

  async markSeeded(version = 1) {
    const meta = getSeedMeta();
    meta.seeded = true;
    meta.seedVersion = version;
  },

  async createSurveyOccurrence(
    data: Omit<
      SurveyOccurrence,
      "id" | "createdAt" | "updatedAt" | "reminderCount" | "surveyKind" | "caseId"
    > & {
      reminderCount?: number;
      surveyKind?: SurveyKind;
      caseId?: string | null;
    }
  ): Promise<SurveyOccurrence> {
    const id = nanoid();
    const now = new Date().toISOString();
    const reminderCount = data.reminderCount ?? 0;
    const pool = getPool();
    const surveyKind: SurveyKind =
      data.surveyKind === "resolution" ? "resolution" : "regular";
    const caseId = data.caseId ?? null;
    await pool.query(
      `INSERT INTO retention_survey_occurrences
        (id, driver_id, token, scheduled_at, sent_at, completed_at, triggered_by,
         survey_kind, case_id, response_state, reminder_count, provider_message_id,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        toDriverDbId(data.driverId),
        data.token,
        toDateTime(data.scheduledAt),
        toDateTime(data.sentAt),
        toDateTime(data.completedAt),
        data.triggeredBy,
        surveyKind,
        caseId,
        data.responseState,
        reminderCount,
        data.providerMessageId ?? null,
        toDateTime(now),
        toDateTime(now),
      ]
    );
    return {
      id,
      driverId: data.driverId,
      token: data.token,
      scheduledAt: data.scheduledAt,
      sentAt: data.sentAt,
      completedAt: data.completedAt,
      triggeredBy: data.triggeredBy,
      surveyKind,
      caseId,
      responseState: data.responseState,
      reminderCount,
      providerMessageId: data.providerMessageId ?? null,
      createdAt: now,
      updatedAt: now,
    };
  },

  async updateSurveyOccurrence(
    idOrToken: string,
    patch: Partial<SurveyOccurrence>
  ): Promise<SurveyOccurrence | null> {
    const pool = getPool();
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM retention_survey_occurrences WHERE id = ? OR token = ? LIMIT 1`,
      [idOrToken, idOrToken]
    );
    if (!rows[0]) return null;

    const current = mapSurveyOccurrence(rows[0]);
    const merged: SurveyOccurrence = {
      ...current,
      ...patch,
      id: current.id,
      updatedAt: new Date().toISOString(),
    };

    await pool.query(
      `UPDATE retention_survey_occurrences SET
        driver_id = ?, token = ?, scheduled_at = ?, sent_at = ?, completed_at = ?,
        triggered_by = ?, survey_kind = ?, case_id = ?, response_state = ?,
        reminder_count = ?, provider_message_id = ?, updated_at = ?
       WHERE id = ?`,
      [
        toDriverDbId(merged.driverId),
        merged.token,
        toDateTime(merged.scheduledAt),
        toDateTime(merged.sentAt),
        toDateTime(merged.completedAt),
        merged.triggeredBy,
        merged.surveyKind === "resolution" ? "resolution" : "regular",
        merged.caseId ?? null,
        merged.responseState,
        merged.reminderCount,
        merged.providerMessageId ?? null,
        toDateTime(merged.updatedAt),
        merged.id,
      ]
    );
    return merged;
  },

  async findSurveyByToken(token: string): Promise<SurveyOccurrence | null> {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT * FROM retention_survey_occurrences WHERE token = ? LIMIT 1`,
      [token]
    );
    return rows[0] ? mapSurveyOccurrence(rows[0]) : null;
  },

  async listSurveyOccurrences(driverId?: string): Promise<SurveyOccurrence[]> {
    const pool = getPool();
    const [rows] = driverId
      ? await pool.query<RowDataPacket[]>(
          `SELECT * FROM retention_survey_occurrences WHERE driver_id = ? ORDER BY created_at DESC`,
          [toDriverDbId(driverId)]
        )
      : await pool.query<RowDataPacket[]>(
          `SELECT * FROM retention_survey_occurrences ORDER BY created_at DESC`
        );
    return rows.map(mapSurveyOccurrence);
  },

  async createSurveyResponse(
    data: Omit<SurveyResponse, "id" | "submittedAt"> & { submittedAt?: string }
  ): Promise<SurveyResponse> {
    const id = nanoid();
    const submittedAt = data.submittedAt || new Date().toISOString();
    const submittedBy = data.submittedBy === "admin" ? "admin" : "driver";
    const resolutionFeedback = data.resolutionFeedback ?? null;
    await getPool().query(
      `INSERT INTO retention_survey_responses
        (id, driver_id, survey_occurrence_id, overall_rating, general_comment,
         department_feedback, resolution_feedback, branch, submitted_by, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        toDriverDbId(data.driverId),
        data.surveyOccurrenceId,
        data.overallRating,
        data.generalComment,
        JSON.stringify(data.departmentFeedback ?? []),
        resolutionFeedback ? JSON.stringify(resolutionFeedback) : null,
        data.branch,
        submittedBy,
        toDateTime(submittedAt),
      ]
    );
    return {
      id,
      driverId: data.driverId,
      surveyOccurrenceId: data.surveyOccurrenceId,
      overallRating: data.overallRating,
      generalComment: data.generalComment,
      departmentFeedback: data.departmentFeedback ?? [],
      resolutionFeedback,
      branch: data.branch,
      submittedBy,
      submittedAt,
    };
  },

  async listSurveyResponses(driverId?: string): Promise<SurveyResponse[]> {
    const pool = getPool();
    const [rows] = driverId
      ? await pool.query<RowDataPacket[]>(
          `SELECT * FROM retention_survey_responses WHERE driver_id = ? ORDER BY submitted_at DESC`,
          [toDriverDbId(driverId)]
        )
      : await pool.query<RowDataPacket[]>(
          `SELECT * FROM retention_survey_responses ORDER BY submitted_at DESC`
        );
    return rows.map(mapSurveyResponse);
  },

  async getLatestResponse(driverId: string): Promise<SurveyResponse | null> {
    const list = await this.listSurveyResponses(driverId);
    return list[0] || null;
  },

  async upsertRetentionCase(
    driverId: string,
    patch: Partial<RetentionCase> = {}
  ): Promise<RetentionCase> {
    const pool = getPool();
    const dbDriverId = toDriverDbId(driverId);
    const [openRows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM retention_cases
       WHERE driver_id = ? AND status NOT IN ('Resolved', 'Completed')
       ORDER BY updated_at DESC LIMIT 1`,
      [dbDriverId]
    );

    const now = new Date().toISOString();
    let row: RetentionCase;

    if (openRows[0]) {
      row = mapRetentionCase(openRows[0]);
    } else {
      row = {
        id: nanoid(),
        driverId,
        atRisk: true,
        status: "Open",
        createdAt: now,
        updatedAt: now,
        resolvedAt: null,
      };
      await pool.query(
        `INSERT INTO retention_cases
          (id, driver_id, at_risk, status, source_survey_id, overall_rating,
           created_at, updated_at, resolved_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          dbDriverId,
          row.atRisk ? 1 : 0,
          row.status,
          row.sourceSurveyId ?? null,
          row.overallRating ?? null,
          toDateTime(row.createdAt),
          toDateTime(row.updatedAt),
          null,
        ]
      );
    }

    row = { ...row, ...patch, id: row.id, driverId: row.driverId, updatedAt: now };
    if (patch.status === "Resolved" || patch.status === "Completed") {
      row.resolvedAt = now;
      row.atRisk = false;
    }

    await pool.query(
      `UPDATE retention_cases SET
        at_risk = ?, status = ?, source_survey_id = ?, overall_rating = ?,
        updated_at = ?, resolved_at = ?
       WHERE id = ?`,
      [
        row.atRisk ? 1 : 0,
        row.status,
        row.sourceSurveyId ?? null,
        row.overallRating ?? null,
        toDateTime(row.updatedAt),
        toDateTime(row.resolvedAt),
        row.id,
      ]
    );
    return row;
  },

  async getOpenOrLatestCase(driverId: string): Promise<RetentionCase | null> {
    const pool = getPool();
    const dbDriverId = toDriverDbId(driverId);
    const [openRows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM retention_cases
       WHERE driver_id = ? AND status NOT IN ('Resolved', 'Completed')
       ORDER BY updated_at DESC LIMIT 1`,
      [dbDriverId]
    );
    if (openRows[0]) return mapRetentionCase(openRows[0]);

    const [latest] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM retention_cases WHERE driver_id = ? ORDER BY updated_at DESC LIMIT 1`,
      [dbDriverId]
    );
    return latest[0] ? mapRetentionCase(latest[0]) : null;
  },

  async listRetentionCases(): Promise<RetentionCase[]> {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT * FROM retention_cases ORDER BY updated_at DESC`
    );
    return rows.map(mapRetentionCase);
  },

  async updateRetentionCase(
    caseId: string,
    patch: Partial<RetentionCase>
  ): Promise<RetentionCase | null> {
    const pool = getPool();
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM retention_cases WHERE id = ? LIMIT 1`,
      [caseId]
    );
    if (!rows[0]) return null;

    const current = mapRetentionCase(rows[0]);
    const now = new Date().toISOString();
    const merged: RetentionCase = {
      ...current,
      ...patch,
      id: current.id,
      updatedAt: now,
    };
    if (patch.status === "Resolved" || patch.status === "Completed") {
      merged.resolvedAt = now;
      merged.atRisk = false;
    }

    await pool.query(
      `UPDATE retention_cases SET
        driver_id = ?, at_risk = ?, status = ?, source_survey_id = ?, overall_rating = ?,
        updated_at = ?, resolved_at = ?
       WHERE id = ?`,
      [
        toDriverDbId(merged.driverId),
        merged.atRisk ? 1 : 0,
        merged.status,
        merged.sourceSurveyId ?? null,
        merged.overallRating ?? null,
        toDateTime(merged.updatedAt),
        toDateTime(merged.resolvedAt),
        merged.id,
      ]
    );
    return merged;
  },

  async addInternalNote(
    data: Omit<InternalNote, "id" | "createdAt"> & { createdAt?: string }
  ): Promise<InternalNote> {
    const id = nanoid();
    const createdAt = data.createdAt || new Date().toISOString();
    await getPool().query(
      `INSERT INTO retention_internal_notes
        (id, driver_id, case_id, author, body, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        id,
        toDriverDbId(data.driverId),
        data.caseId ?? null,
        data.author,
        data.text,
        toDateTime(createdAt),
      ]
    );
    return {
      id,
      driverId: data.driverId,
      caseId: data.caseId ?? null,
      author: data.author,
      text: data.text,
      createdAt,
    };
  },

  async listInternalNotes(driverId: string): Promise<InternalNote[]> {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT * FROM retention_internal_notes WHERE driver_id = ? ORDER BY created_at DESC`,
      [toDriverDbId(driverId)]
    );
    return rows.map(mapInternalNote);
  },

  async addNotificationLog(
    data: Omit<NotificationLog, "id" | "createdAt">
  ): Promise<NotificationLog> {
    const id = nanoid();
    const createdAt = new Date().toISOString();
    await getPool().query(
      `INSERT INTO retention_notification_logs
        (id, trigger_name, recipient, department, driver_id, survey_response_id, send_result, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.trigger,
        data.recipient,
        data.department ?? null,
        data.driverId != null ? toDriverDbId(data.driverId) : null,
        data.surveyResponseId ?? null,
        data.sendResult != null ? JSON.stringify(data.sendResult) : null,
        toDateTime(createdAt),
      ]
    );
    return {
      id,
      trigger: data.trigger,
      recipient: data.recipient,
      department: data.department,
      driverId: data.driverId,
      surveyResponseId: data.surveyResponseId,
      sendResult: data.sendResult,
      createdAt,
    };
  },

  async isOptedOut(phone: string): Promise<boolean> {
    const e164 = normalizePhoneE164(phone);
    const digits = phoneDigitsLast10(e164 || phone);
    if (!digits) return false;
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT phone, opted_out FROM retention_sms_opt_outs WHERE opted_out = 1`
    );
    return rows.some((row) => {
      if (!row.opted_out) return false;
      const stored = String(row.phone || "");
      if (e164 && stored === e164) return true;
      return phoneDigitsLast10(stored) === digits;
    });
  },

  async setOptOut(phone: string, optedOut: boolean, source = "admin") {
    const pool = getPool();
    const normalized = normalizePhoneE164(phone) || String(phone || "").trim();
    if (!normalized) {
      throw new Error("phone is required");
    }
    const digits = phoneDigitsLast10(normalized);
    const updatedAt = new Date().toISOString();
    const [all] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM retention_sms_opt_outs`
    );
    const existing = all.find((row) => {
      const stored = String(row.phone || "");
      return stored === normalized || phoneDigitsLast10(stored) === digits;
    });

    if (existing) {
      await pool.query(
        `UPDATE retention_sms_opt_outs SET phone = ?, opted_out = ?, source = ?, updated_at = ? WHERE id = ?`,
        [
          normalized,
          optedOut ? 1 : 0,
          source,
          toDateTime(updatedAt),
          String(existing.id),
        ]
      );
      return {
        id: String(existing.id),
        phone: normalized,
        optedOut,
        source,
        updatedAt,
      };
    }

    const id = nanoid();
    await pool.query(
      `INSERT INTO retention_sms_opt_outs (id, phone, opted_out, source, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [id, normalized, optedOut ? 1 : 0, source, toDateTime(updatedAt)]
    );
    return { id, phone: normalized, optedOut, source, updatedAt };
  },

  async hasOccasionSend(
    driverId: string,
    occasionType: "birthday" | "anniversary" | "holiday",
    occasionKey: string
  ): Promise<boolean> {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT id FROM retention_occasion_sends
        WHERE driver_id = ? AND occasion_type = ? AND occasion_key = ?
        LIMIT 1`,
      [toDriverDbId(driverId), occasionType, occasionKey]
    );
    return Boolean(rows[0]);
  },

  async recordOccasionSend(data: {
    driverId: string;
    occasionType: "birthday" | "anniversary" | "holiday";
    occasionKey: string;
    holidayName?: string | null;
    surveyOccurrenceId?: string | null;
    messageBody: string;
    sentAt?: string;
  }) {
    const id = nanoid();
    const sentAt = data.sentAt || new Date().toISOString();
    await getPool().query(
      `INSERT INTO retention_occasion_sends
        (id, driver_id, occasion_type, occasion_key, holiday_name,
         survey_occurrence_id, message_body, sent_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        toDriverDbId(data.driverId),
        data.occasionType,
        data.occasionKey,
        data.holidayName ?? null,
        data.surveyOccurrenceId ?? null,
        data.messageBody,
        toDateTime(sentAt),
      ]
    );
    return { id, ...data, sentAt };
  },
};

export type { CaseStatus };
