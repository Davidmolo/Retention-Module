"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Mail,
  Phone,
  Send,
  UserRound,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MAX_SURVEY_REMINDERS } from "@/lib/retention/constants";
import { StatusPill, Stars } from "./ui";
import { DEPARTMENTS, type Department } from "@/lib/retention/types";
import {
  getCachedDriverDetail,
  setCachedDriverDetail,
  prefetchOverview,
  invalidateOverviewCache,
  refreshOverview,
  patchOverviewCaseStatus,
} from "@/lib/retention/driverCache";

type SurveyResponse = {
  id: string;
  overallRating: number;
  generalComment: string;
  submittedAt: string;
  submittedBy?: "driver" | "admin";
  departmentFeedback: { department: string; rating: number; comment?: string }[];
  resolutionFeedback?: {
    quickly: number;
    efficiently: number;
    effectively: number;
  } | null;
};

type SurveyOccurrence = {
  id: string;
  driverId: string;
  scheduledAt: string;
  sentAt?: string;
  completedAt?: string;
  triggeredBy: "system" | "admin";
  surveyKind?: "regular" | "resolution";
  responseState: "pending" | "sent" | "reminded" | "completed" | "non_response";
  reminderCount: number;
  createdAt: string;
  updatedAt: string;
};

type Detail = {
  driver: {
    id: string;
    name: string;
    email: string;
    phone: string;
    driverTypeLabel: string;
    status: string;
    hireDate: string;
    dispatcher: string;
    avatarInitials: string;
    cpm: number | null;
  };
  averages: {
    milesPerWeek: number | null;
    driverPayroll: number | null;
    grossMarginPct: number | null;
    cpm: number | null;
    weeksCounted?: number;
  };
  responses: SurveyResponse[];
  resolutionResponses?: SurveyResponse[];
  occurrences?: SurveyOccurrence[];
  retentionCase: {
    id: string;
    status: string;
    atRisk: boolean;
    sourceSurveyId?: string;
  } | null;
  notes: { id: string; author: string; text: string; createdAt: string }[];
  gpMode: string;
};

const tabs = [
  "Overview",
  "Survey History",
  "Notes",
  "Follow-ups",
  "Resolution",
] as const;
const CAROUSEL_PREVIEW = 6;
const DRIVER_LIST_PAGE_SIZE = 5;

export function DriverDetailClient({ driverId }: { driverId: string }) {
  const cached = getCachedDriverDetail<Detail>(driverId);
  const [data, setData] = useState<Detail | null>(cached);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<(typeof tabs)[number]>("Overview");
  const [status, setStatus] = useState(cached?.retentionCase?.status || "Open");
  const [notes, setNotes] = useState<Detail["notes"]>(cached?.notes ?? []);
  const [caseId, setCaseId] = useState<string | null>(cached?.retentionCase?.id || null);
  const [busySurvey, setBusySurvey] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [surveySent, setSurveySent] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    // Warm overview so "Back to Retention" is instant
    prefetchOverview();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const existing = getCachedDriverDetail<Detail>(driverId);
    // Older cache entries may lack occurrences — refetch so Follow-ups works.
    if (existing && Array.isArray(existing.occurrences)) {
      setData(existing);
      setStatus(existing.retentionCase?.status || "Open");
      setNotes(existing.notes);
      setCaseId(existing.retentionCase?.id || null);
      setLoadError(null);
      return;
    }

    setData(null);
    setLoadError(null);
    setMessage(null);
    setSurveySent(false);

    fetch(`/api/retention/drivers/${encodeURIComponent(driverId)}`)
      .then(async (res) => {
        const json = await res.json();
        if (!json.ok) throw new Error(json.error || "Failed to load driver");
        if (cancelled) return;
        const detail = json.data as Detail;
        setCachedDriverDetail(driverId, detail);
        setData(detail);
        setStatus(detail.retentionCase?.status || "Open");
        setNotes(detail.notes);
        setCaseId(detail.retentionCase?.id || null);
      })
      .catch((e: Error) => {
        if (!cancelled) setLoadError(e.message || "Failed to load driver");
      });

    return () => {
      cancelled = true;
    };
  }, [driverId]);

  const atRisk =
    !!data?.retentionCase?.atRisk && status !== "Resolved" && status !== "Completed";
  const carouselItems = data?.responses.slice(0, CAROUSEL_PREVIEW) ?? [];
  const driverCode = (data?.driver.id || driverId).replace(/^gp-drv-/, "DRV-").toUpperCase();
  const caseReminderCount = useMemo(() => {
    const sourceId = data?.retentionCase?.sourceSurveyId;
    if (!sourceId || !data?.occurrences?.length) return 0;
    return (
      data.occurrences.find((o) => o.id === sourceId)?.reminderCount || 0
    );
  }, [data?.retentionCase?.sourceSurveyId, data?.occurrences]);

  const info = useMemo(() => {
    if (!data) return [];
    return [
      { label: "Phone", value: data.driver.phone, icon: <Phone size={14} /> },
      { label: "Email", value: data.driver.email, icon: <Mail size={14} /> },
      {
        label: "Driver Type",
        value: data.driver.driverTypeLabel,
        icon: <UserRound size={14} />,
      },
      {
        label: "Hire Date",
        value: new Date(data.driver.hireDate).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
      },
      { label: "Status", value: data.driver.status, kind: "status" as const },
      { label: "Assigned Dispatcher", value: data.driver.dispatcher },
    ];
  }, [data]);

  async function sendSurvey() {
    if (!data) return;
    setBusySurvey(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/retention/drivers/${data.driver.id}/send-survey`, {
        method: "POST",
      });
      const raw = await res.text();
      let json: { ok?: boolean; error?: string; data?: unknown };
      try {
        json = JSON.parse(raw) as { ok?: boolean; error?: string; data?: unknown };
      } catch {
        if (res.status === 401) {
          throw new Error("Unauthorized — please sign in again");
        }
        if (res.redirected || raw.trimStart().startsWith("<!DOCTYPE") || raw.trimStart().startsWith("<html")) {
          throw new Error(
            "Server returned a web page instead of JSON. Sign in again. On live, also set DATABASE_URL and run migrations."
          );
        }
        throw new Error(raw.slice(0, 200) || `Request failed (${res.status})`);
      }
      if (!json.ok) throw new Error(json.error || `Request failed (${res.status})`);
      setSurveySent(true);
      const payload = json.data as {
        resent?: boolean;
        smsMocked?: boolean;
        occurrence?: SurveyOccurrence;
      };
      const resent = Boolean(payload.resent);
      setMessage(
        payload.smsMocked
          ? "Link has been sent (SMS mocked — provider not active)."
          : resent
            ? "Link has been sent (same open survey resent)."
            : "Link has been sent."
      );
      const occurrence = payload.occurrence;
      if (occurrence && data) {
        const prev = data.occurrences || [];
        const without = prev.filter((o) => o.id !== occurrence.id);
        const next: Detail = {
          ...data,
          occurrences: [occurrence, ...without],
        };
        setData(next);
        setCachedDriverDetail(driverId, next);
      }
      invalidateOverviewCache();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusySurvey(false);
    }
  }

  async function saveStatus(next: string) {
    if (!caseId || !data) return;
    const prev = status;
    const prevCase = data.retentionCase;
    setStatus(next);
    const atRiskNext = next !== "Resolved" && next !== "Completed";
    const optimisticCase = data.retentionCase
      ? { ...data.retentionCase, status: next, atRisk: atRiskNext }
      : null;
    if (optimisticCase) {
      const optimisticData = { ...data, retentionCase: optimisticCase };
      setData(optimisticData);
      setCachedDriverDetail(driverId, optimisticData);
    }
    // Update Recent Responses / At Risk counts in the overview cache immediately.
    patchOverviewCaseStatus(driverId, next, atRiskNext);
    try {
      const res = await fetch(`/api/retention/cases/${caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      const saved = json.data as {
        id: string;
        status: string;
        atRisk: boolean;
      };
      const savedStatus = saved.status || next;
      const savedAtRisk = Boolean(saved.atRisk);
      const nextData = {
        ...data,
        retentionCase: {
          id: saved.id || caseId,
          status: savedStatus,
          atRisk: savedAtRisk,
          sourceSurveyId: data.retentionCase?.sourceSurveyId,
        },
      };
      setData(nextData);
      setCachedDriverDetail(driverId, nextData);
      setStatus(savedStatus);
      patchOverviewCaseStatus(driverId, savedStatus, savedAtRisk);
      await refreshOverview();
    } catch (e) {
      setStatus(prev);
      const rolled = { ...data, retentionCase: prevCase };
      setData(rolled);
      setCachedDriverDetail(driverId, rolled);
      if (prevCase) {
        patchOverviewCaseStatus(
          driverId,
          prevCase.status,
          Boolean(prevCase.atRisk)
        );
      }
      setMessage((e as Error).message);
    }
  }

  const addNote = useCallback(
    async (textRaw: string) => {
      if (!data || !textRaw.trim() || savingNote) return;
      const text = textRaw.trim();
      const tempId = `temp-${Date.now()}`;
      const optimistic = {
        id: tempId,
        author: "Admin",
        text,
        createdAt: new Date().toISOString(),
      };
      setNotes((prev) => [optimistic, ...prev]);
      setSavingNote(true);
      try {
        const res = await fetch(`/api/retention/drivers/${data.driver.id}/notes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            caseId,
            author: "Admin",
          }),
        });
        const json = await res.json();
        if (!json.ok) throw new Error(json.error);
        setNotes((prev) => {
          const next = prev.map((n) => (n.id === tempId ? json.data : n));
          setCachedDriverDetail(data.driver.id, { ...data, notes: next });
          invalidateOverviewCache();
          return next;
        });
      } catch (e) {
        setNotes((prev) => prev.filter((n) => n.id !== tempId));
        setMessage((e as Error).message);
        throw e;
      } finally {
        setSavingNote(false);
      }
    },
    [caseId, data, savingNote]
  );

  if (loadError) {
    return (
      <div className="w-full min-w-0 space-y-4">
        <Link
          href="/retention"
          onMouseEnter={() => prefetchOverview()}
          onFocus={() => prefetchOverview()}
          className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--xxii-muted)] hover:text-[var(--xxii-blue)]"
        >
          <ArrowLeft size={16} />
          Back to Retention
        </Link>
        <div className="xxii-card p-8 text-sm text-rose-600">{loadError}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="w-full min-w-0 max-w-full space-y-4 overflow-x-hidden sm:space-y-6">
        <Link
          href="/retention"
          onMouseEnter={() => prefetchOverview()}
          onFocus={() => prefetchOverview()}
          className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--xxii-muted)] hover:text-[var(--xxii-blue)]"
        >
          <ArrowLeft size={16} />
          Back to Retention
        </Link>
        <div className="xxii-card animate-pulse space-y-4 p-4 sm:p-6">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-slate-200 sm:h-16 sm:w-16" />
            <div className="space-y-2">
              <div className="h-5 w-48 rounded bg-slate-200" />
              <div className="h-3 w-32 rounded bg-slate-100" />
            </div>
          </div>
          <div className="h-10 w-full rounded-xl bg-slate-100" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-16 rounded-xl bg-slate-100" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 max-w-full space-y-4 overflow-x-hidden sm:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/retention"
          onMouseEnter={() => prefetchOverview()}
          onFocus={() => prefetchOverview()}
          className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--xxii-muted)] hover:text-[var(--xxii-blue)]"
        >
          <ArrowLeft size={16} />
          Back to Retention
        </Link>
        {message && (
          <div className="max-w-full rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
            {message}
          </div>
        )}
      </div>

      <section className="xxii-card w-full min-w-0 max-w-full overflow-hidden p-4 sm:p-6">
        {/* Header */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 to-blue-700 text-base font-extrabold text-white shadow-lg shadow-blue-500/20 sm:h-16 sm:w-16 sm:text-lg">
              {data.driver.avatarInitials}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-xl font-extrabold tracking-tight text-[var(--xxii-text)] sm:text-2xl">
                  {data.driver.name}
                </h2>
                {atRisk && <span className="status-pill status-open">At Risk</span>}
              </div>
              <p className="mt-1 text-sm text-[var(--xxii-muted)]">Driver ID · {driverCode}</p>
            </div>
          </div>
          <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row">
            <button
              type="button"
              disabled={busySurvey}
              onClick={sendSurvey}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--xxii-blue)] px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-500/25 hover:brightness-110 disabled:opacity-60 sm:w-auto"
            >
              <Send size={16} />
              Send Survey
            </button>
          </div>
        </div>

        {surveySent && (
          <div className="mt-4 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">
            Link has been sent
          </div>
        )}

        {/* Tabs */}
        <div className="mt-5 max-w-full overflow-x-auto border-b border-[var(--xxii-line)]">
          <div className="flex w-max gap-1 pb-px">
            {tabs.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`shrink-0 border-b-2 px-3 py-2.5 text-sm font-semibold sm:px-4 ${
                  tab === t
                    ? "border-[var(--xxii-blue)] text-[var(--xxii-blue)]"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="min-w-0">
            {tab === "Overview" && (
              <div className="mt-5 grid w-full min-w-0 gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                <div className="min-w-0 space-y-5">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {info.map((item) => (
                      <div
                        key={item.label}
                        className="rounded-xl border border-[var(--xxii-line)] bg-slate-50/80 px-3.5 py-3"
                      >
                        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--xxii-muted)]">
                          {item.icon}
                          {item.label}
                        </div>
                        {"kind" in item && item.kind === "status" ? (
                          <DriverStatusBadge status={item.value} />
                        ) : (
                          <div className="break-words text-sm font-semibold text-[var(--xxii-text)]">
                            {item.value}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="rounded-2xl border border-sky-100 bg-[linear-gradient(135deg,#eff6ff,#f8fbff)] p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-bold text-sky-900">
                        Gross Profit · 6 Week Avg
                      </h3>
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                        {(data.gpMode || "live").toUpperCase()} data
                      </span>
                    </div>
                    {(data.averages.weeksCounted ?? 0) === 0 &&
                    data.averages.milesPerWeek == null ? (
                      <p className="rounded-xl bg-white/80 px-3 py-3 text-sm text-slate-600 ring-1 ring-sky-100">
                        This driver has no Gross Profit activity in the last 6
                        completed weeks in the database. Weekly reports are kept
                        in sync for those periods; if they had no loads/fuel/tolls
                        in that window, averages stay empty.
                      </p>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                          <Metric
                            label="Miles / Week"
                            value={fmtNum(data.averages.milesPerWeek)}
                          />
                          <Metric
                            label="Driver Payroll"
                            value={fmtMoney(data.averages.driverPayroll)}
                          />
                          <Metric
                            label="Gross Margin"
                            value={
                              data.averages.grossMarginPct == null
                                ? "—"
                                : `${data.averages.grossMarginPct}%`
                            }
                          />
                          <Metric
                            label="CPM"
                            value={
                              data.averages.cpm == null
                                ? "—"
                                : `$${data.averages.cpm.toFixed(2)}`
                            }
                          />
                        </div>
                        {data.averages.weeksCounted != null &&
                          data.averages.weeksCounted > 0 &&
                          data.averages.weeksCounted < 6 && (
                            <p className="mt-2 text-xs text-sky-800/70">
                              Based on {data.averages.weeksCounted} week
                              {data.averages.weeksCounted === 1 ? "" : "s"} in DB (up to 6).
                            </p>
                          )}
                      </>
                    )}
                  </div>

                  <SurveyHistoryCarousel
                    responses={carouselItems}
                    totalCount={data.responses.length}
                    onViewAll={() => setTab("Survey History")}
                  />
                </div>

                <div className="min-w-0 space-y-5">
                  {data.retentionCase && (
                    <CaseStatusCard
                      status={status}
                      onSave={saveStatus}
                      reminderCount={caseReminderCount}
                    />
                  )}
                  <NotesCard notes={notes} saving={savingNote} onAdd={addNote} />
                </div>
              </div>
            )}

            {tab === "Survey History" && (
              <div className="mt-5 grid w-full min-w-0 gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                <SurveyHistoryAll
                  responses={data.responses}
                  onBack={() => setTab("Overview")}
                />
                <div className="min-w-0 space-y-5">
                  {data.retentionCase && (
                    <CaseStatusCard
                      status={status}
                      onSave={saveStatus}
                      reminderCount={caseReminderCount}
                    />
                  )}
                </div>
              </div>
            )}

            {tab === "Notes" && (
              <div className="mt-5 max-w-3xl">
                <NotesCard notes={notes} saving={savingNote} onAdd={addNote} tall />
              </div>
            )}

            {tab === "Follow-ups" && (
              <div className="mt-5 max-w-3xl">
                <FollowUpsPanel occurrences={data.occurrences || []} />
              </div>
            )}

            {tab === "Resolution" && (
              <div className="mt-5 max-w-3xl">
                <ResolutionPanel
                  responses={data.resolutionResponses || []}
                  occurrences={(data.occurrences || []).filter(
                    (o) => o.surveyKind === "resolution"
                  )}
                />
              </div>
            )}
          </div>
      </section>
    </div>
  );
}

function DriverStatusBadge({ status }: { status: string }) {
  const active = status.toLowerCase() === "active";
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold capitalize ${
        active
          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
          : "bg-slate-100 text-slate-600 ring-1 ring-slate-200"
      }`}
    >
      {status}
    </span>
  );
}

function CaseStatusCard({
  status,
  onSave,
  reminderCount = 0,
}: {
  status: string;
  onSave: (next: string) => void;
  reminderCount?: number;
}) {
  return (
    <div className="rounded-2xl border border-[var(--xxii-line)] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold">Case Status</h3>
        <StatusPill status={status} />
      </div>
      {reminderCount > 0 && (
        <div className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
          Survey reminders before submit:{" "}
          <span className="font-extrabold">
            Reminder {reminderCount} of {MAX_SURVEY_REMINDERS}
          </span>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {(["Open", "In Progress", "Resolved"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onSave(s)}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold ring-1 ${
              status === s
                ? "bg-[var(--xxii-blue)] text-white ring-[var(--xxii-blue)]"
                : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function NotesCard({
  notes,
  saving,
  onAdd,
  tall,
}: {
  notes: { id: string; author: string; text: string; createdAt: string }[];
  saving: boolean;
  onAdd: (text: string) => Promise<void>;
  tall?: boolean;
}) {
  const [draft, setDraft] = useState("");

  async function handleSave() {
    const text = draft.trim();
    if (!text || saving) return;
    setDraft("");
    try {
      await onAdd(text);
    } catch {
      setDraft(text);
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--xxii-line)] p-4">
      <h3 className="mb-3 text-sm font-bold">Internal Notes</h3>
      <div
        className={`mb-3 space-y-3 overflow-auto pr-1 ${tall ? "max-h-[28rem]" : "max-h-64"}`}
      >
        {notes.map((n) => (
          <div key={n.id} className="rounded-xl bg-slate-50 px-3 py-2.5">
            <div className="mb-1 flex items-center justify-between gap-2 text-xs text-[var(--xxii-muted)]">
              <span className="font-bold text-slate-700">{n.author}</span>
              <span className="shrink-0">
                {new Date(n.createdAt).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
            </div>
            <p className="text-sm text-slate-700">{n.text}</p>
          </div>
        ))}
        {!notes.length && <p className="text-sm text-slate-400">No notes yet.</p>}
      </div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Add an internal note (not visible to driver)..."
        className="min-h-20 w-full rounded-xl border border-[var(--xxii-line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--xxii-blue)]"
      />
      <button
        type="button"
        disabled={saving || !draft.trim()}
        onClick={handleSave}
        className="mt-2 rounded-xl bg-[var(--xxii-blue)] px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save Note"}
      </button>
    </div>
  );
}

function SurveyHistoryCarousel({
  responses,
  totalCount,
  onViewAll,
}: {
  responses: SurveyResponse[];
  totalCount: number;
  onViewAll: () => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  function scrollByCard(dir: -1 | 1) {
    const el = scrollerRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>("[data-survey-card]");
    const amount = (card?.offsetWidth || 240) + 12;
    el.scrollBy({ left: dir * amount, behavior: "smooth" });
  }

  return (
    <div className="w-full min-w-0 max-w-full rounded-2xl border border-[var(--xxii-line)] p-4">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-bold">Recent Survey History</h3>
          <p className="mt-0.5 text-xs text-[var(--xxii-muted)]">
            {totalCount} total response{totalCount === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {responses.length > 1 && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Previous surveys"
                onClick={() => scrollByCard(-1)}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                aria-label="Next surveys"
                onClick={() => scrollByCard(1)}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
          {totalCount > 0 && (
            <button
              type="button"
              onClick={onViewAll}
              className="rounded-lg bg-[var(--xxii-blue-soft)] px-3 py-1.5 text-xs font-bold text-[var(--xxii-blue)] transition hover:bg-sky-100"
            >
              View all
            </button>
          )}
        </div>
      </div>

      {!responses.length ? (
        <div className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-400">
          No surveys yet — use Send Survey to create a survey link.
        </div>
      ) : (
        <div
          ref={scrollerRef}
          className="flex w-full min-w-0 max-w-full snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {responses.map((r) => (
            <SurveyCard key={r.id} response={r} compact />
          ))}
        </div>
      )}
    </div>
  );
}

function SurveyHistoryAll({
  responses,
  onBack,
}: {
  responses: SurveyResponse[];
  onBack: () => void;
}) {
  const [page, setPage] = useState(1);
  const { slice, total, totalPages, safePage, from, to } = paginateList(
    responses,
    page,
    DRIVER_LIST_PAGE_SIZE
  );

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  return (
    <div className="min-w-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold">All Survey History</h3>
          <p className="mt-0.5 text-xs text-[var(--xxii-muted)]">
            {total === 0
              ? "0 responses for this driver"
              : `${from}–${to} of ${total} response${total === 1 ? "" : "s"}`}
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-200"
        >
          Back to Overview
        </button>
      </div>

      {!total ? (
        <div className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-400">
          No surveys yet — use Send Survey to create a survey link.
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {slice.map((r) => (
              <SurveyCard key={r.id} response={r} />
            ))}
          </div>
          <ListPagination
            page={safePage}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}

function SurveyCard({
  response,
  compact,
}: {
  response: SurveyResponse;
  compact?: boolean;
}) {
  const branchLabel = response.overallRating <= 3 ? "At Risk" : "Completed";
  const isAdmin = response.submittedBy === "admin";

  return (
    <article
      data-survey-card
      className={`box-border rounded-xl border border-[var(--xxii-line)] bg-white p-4 shadow-sm ${
        compact
          ? "w-[300px] max-w-[92vw] shrink-0 snap-start"
          : "w-full min-w-0 max-w-full"
      }`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <div className="text-[11px] font-bold text-[var(--xxii-muted)]">
            {new Date(response.submittedAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </div>
          <div className="mt-1">
            <Stars value={response.overallRating} size="sm" />
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
              response.overallRating <= 3
                ? "bg-amber-50 text-amber-700"
                : "bg-emerald-50 text-emerald-700"
            }`}
          >
            {branchLabel}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${
              isAdmin
                ? "bg-violet-50 text-violet-700 ring-violet-200"
                : "bg-sky-50 text-sky-700 ring-sky-200"
            }`}
          >
            {isAdmin ? "Admin test" : "Driver"}
          </span>
        </div>
      </div>

      <p
        className={`mb-3 text-sm leading-relaxed text-slate-600 ${
          compact ? "line-clamp-2" : ""
        }`}
      >
        {response.generalComment || "No comment"}
      </p>

      <DepartmentRatingsWidget
        feedback={response.departmentFeedback}
        compact={compact}
      />
    </article>
  );
}

function DepartmentRatingsWidget({
  feedback,
  compact,
}: {
  feedback: { department: string; rating: number; comment?: string }[];
  compact?: boolean;
}) {
  const byDept = new Map(
    (feedback || []).map((d) => [d.department as Department, d])
  );

  return (
    <div
      className={`rounded-xl border border-[var(--xxii-line)] bg-slate-50/80 ${
        compact ? "p-2.5" : "p-3"
      }`}
    >
      <div
        className={`mb-2 font-bold uppercase tracking-wide text-[var(--xxii-muted)] ${
          compact ? "text-[10px]" : "text-[11px]"
        }`}
      >
        Department ratings
      </div>
      <div className="grid grid-cols-2 gap-2">
        {DEPARTMENTS.map((dept) => {
          const row = byDept.get(dept);
          const rating = row?.rating ?? 0;
          const low = rating > 0 && rating <= 3;
          return (
            <div
              key={dept}
              className={`rounded-lg bg-white px-2.5 py-2 ring-1 ${
                low ? "ring-rose-200" : "ring-slate-200"
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span
                  className={`font-bold text-slate-700 ${
                    compact ? "text-[11px]" : "text-xs"
                  }`}
                >
                  {dept}
                </span>
                {rating > 0 ? (
                  <span
                    className={`font-extrabold ${
                      low ? "text-rose-600" : "text-amber-500"
                    } ${compact ? "text-xs" : "text-sm"}`}
                  >
                    {rating}★
                  </span>
                ) : (
                  <span className="text-[11px] font-semibold text-slate-300">—</span>
                )}
              </div>
              {!compact && row?.comment && (
                <p className="mt-1 text-[11px] leading-snug text-slate-500">
                  {row.comment}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FollowUpsPanel({ occurrences }: { occurrences: SurveyOccurrence[] }) {
  const [page, setPage] = useState(1);
  const sorted = useMemo(
    () =>
      [...occurrences].sort((a, b) => {
        const da = a.sentAt || a.createdAt;
        const db = b.sentAt || b.createdAt;
        return db.localeCompare(da);
      }),
    [occurrences]
  );

  const surveysSent = sorted.filter((o) => o.sentAt || o.responseState !== "pending")
    .length;
  const totalReminders = sorted.reduce((n, o) => n + (o.reminderCount || 0), 0);
  const awaitingReply = sorted.filter((o) =>
    ["sent", "reminded"].includes(o.responseState)
  ).length;

  const { slice, total, totalPages, safePage, from, to } = paginateList(
    sorted,
    page,
    DRIVER_LIST_PAGE_SIZE
  );

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  if (!sorted.length) {
    return (
      <EmptyTab
        icon={<ClipboardList size={22} />}
        title="No survey outreach yet"
        body="When a survey is sent or reminded, each touch shows up here so you can see how many follow-ups this driver has received."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-[var(--xxii-text)]">
            Survey follow-ups
          </h3>
          <p className="mt-0.5 text-xs text-[var(--xxii-muted)]">
            SMS sends and reminders for this driver
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
          {from}–{to} of {total}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Metric label="Surveys sent" value={String(surveysSent)} />
        <Metric label="Reminders sent" value={String(totalReminders)} />
        <Metric label="Awaiting reply" value={String(awaitingReply)} />
      </div>

      <ul className="divide-y divide-[var(--xxii-line)] overflow-hidden rounded-2xl border border-[var(--xxii-line)]">
        {slice.map((o) => {
          const dateValue = o.sentAt || o.createdAt;
          return (
            <li
              key={o.id}
              className="flex flex-wrap items-start justify-between gap-3 px-4 py-3.5"
            >
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[var(--xxii-text)]">
                  {formatShortDate(dateValue)}
                </div>
                <div className="mt-0.5 text-xs text-[var(--xxii-muted)]">
                  {o.surveyKind === "resolution" ? "Resolution · " : ""}
                  Triggered by {o.triggeredBy === "admin" ? "admin" : "system"}
                  {o.completedAt
                    ? ` · Completed ${formatShortDate(o.completedAt)}`
                    : ""}
                </div>
                <div className="mt-1.5 text-xs font-medium text-slate-600">
                  {o.reminderCount > 0
                    ? `Reminder ${o.reminderCount} of ${MAX_SURVEY_REMINDERS}`
                    : "No reminders yet"}
                </div>
              </div>
              <StatusPill status={occurrenceStatusLabel(o.responseState)} />
            </li>
          );
        })}
      </ul>

      <ListPagination
        page={safePage}
        totalPages={totalPages}
        onPageChange={setPage}
      />
    </div>
  );
}

function paginateList<T>(list: T[], page: number, pageSize: number) {
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  const slice = list.slice(start, start + pageSize);
  const from = total === 0 ? 0 : start + 1;
  const to = Math.min(start + pageSize, total);
  return { slice, total, totalPages, safePage, from, to };
}

function ListPagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
      <p className="text-xs text-[var(--xxii-muted)]">
        Page {page} of {totalPages}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
          className="inline-flex items-center gap-1 rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft size={14} />
          Prev
        </button>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          className="inline-flex items-center gap-1 rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

function occurrenceStatusLabel(
  state: SurveyOccurrence["responseState"]
): string {
  switch (state) {
    case "pending":
      return "Scheduled";
    case "sent":
      return "Pending";
    case "reminded":
      return "Reminded";
    case "completed":
      return "Completed";
    case "non_response":
      return "No response";
    default:
      return state;
  }
}

function formatShortDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function ResolutionPanel({
  responses,
  occurrences,
}: {
  responses: SurveyResponse[];
  occurrences: SurveyOccurrence[];
}) {
  const pending = occurrences.filter((o) =>
    ["pending", "sent", "reminded"].includes(o.responseState)
  );

  if (!responses.length && !pending.length) {
    return (
      <EmptyTab
        icon={<ClipboardList size={22} />}
        title="Resolution follow-up"
        body="When a case is marked Resolved, a follow-up survey is sent asking how quickly, efficiently, and effectively the issue was fixed. Results will show here."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-bold text-[var(--xxii-text)]">
          Resolution follow-up
        </h3>
        <p className="mt-1 text-xs text-[var(--xxii-muted)]">
          How quickly, efficiently, and effectively the problem was resolved.
        </p>
      </div>

      {pending.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-900">
          {pending.length} resolution survey
          {pending.length === 1 ? "" : "s"} awaiting driver response
        </div>
      )}

      <ul className="divide-y divide-[var(--xxii-line)] overflow-hidden rounded-2xl border border-[var(--xxii-line)]">
        {responses.map((r) => {
          const fb = r.resolutionFeedback;
          return (
            <li key={r.id} className="px-4 py-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold">
                  {formatShortDate(r.submittedAt)}
                </span>
                <Stars value={r.overallRating} size="sm" />
              </div>
              {fb && (
                <div className="mt-2 grid gap-1.5 text-xs text-slate-600 sm:grid-cols-3">
                  <div>
                    Quickly: <span className="font-bold">{fb.quickly}★</span>
                  </div>
                  <div>
                    Efficiently:{" "}
                    <span className="font-bold">{fb.efficiently}★</span>
                  </div>
                  <div>
                    Effectively:{" "}
                    <span className="font-bold">{fb.effectively}★</span>
                  </div>
                </div>
              )}
              {r.generalComment ? (
                <p className="mt-2 text-xs text-slate-500">{r.generalComment}</p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function EmptyTab({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-[var(--xxii-blue)]">
        {icon}
      </div>
      <h3 className="text-base font-bold">{title}</h3>
      <p className="mt-2 max-w-md text-sm text-[var(--xxii-muted)]">{body}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/90 px-3 py-3 ring-1 ring-sky-100">
      <div className="text-[10px] font-bold uppercase tracking-wide text-sky-700/70 sm:text-[11px]">
        {label}
      </div>
      <div className="mt-1 text-lg font-extrabold text-slate-900 sm:text-xl">{value}</div>
    </div>
  );
}

function fmtNum(n: number | null) {
  if (n == null) return "—";
  return n.toLocaleString("en-US");
}

function fmtMoney(n: number | null) {
  if (n == null) return "—";
  return `$${n.toLocaleString("en-US")}`;
}
