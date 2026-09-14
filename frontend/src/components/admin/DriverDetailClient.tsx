"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Copy,
  Mail,
  Phone,
  Send,
  UserRound,
} from "lucide-react";
import { useMemo, useState } from "react";
import { StatusPill, Stars } from "./ui";

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
  };
  responses: {
    id: string;
    overallRating: number;
    generalComment: string;
    submittedAt: string;
    departmentFeedback: { department: string; rating: number; comment?: string }[];
  }[];
  retentionCase: {
    id: string;
    status: string;
    atRisk: boolean;
  } | null;
  notes: { id: string; author: string; text: string; createdAt: string }[];
  gpMode: string;
};

const tabs = ["Overview", "Survey History", "Notes", "Follow-ups", "Documents"] as const;

export function DriverDetailClient({ data }: { data: Detail }) {
  const router = useRouter();
  const [tab, setTab] = useState<(typeof tabs)[number]>("Overview");
  const [status, setStatus] = useState(data.retentionCase?.status || "Open");
  const [note, setNote] = useState("");
  const [notes, setNotes] = useState(data.notes);
  const [busy, setBusy] = useState(false);
  const [surveyUrl, setSurveyUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const atRisk = data.retentionCase?.atRisk && status !== "Resolved" && status !== "Completed";

  const info = useMemo(
    () => [
      { label: "Phone", value: data.driver.phone, icon: <Phone size={14} /> },
      { label: "Email", value: data.driver.email, icon: <Mail size={14} /> },
      { label: "Driver Type", value: data.driver.driverTypeLabel, icon: <UserRound size={14} /> },
      {
        label: "Hire Date",
        value: new Date(data.driver.hireDate).toLocaleDateString(),
      },
      { label: "Status", value: data.driver.status },
      { label: "Assigned Dispatcher", value: data.driver.dispatcher },
    ],
    [data]
  );

  async function sendSurvey() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/retention/drivers/${data.driver.id}/send-survey`, {
        method: "POST",
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setSurveyUrl(json.data.surveyUrl);
      setMessage("Survey created (SMS mocked). Link ready below.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveStatus(next: string) {
    if (!data.retentionCase?.id) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/retention/cases/${data.retentionCase.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setStatus(next);
      router.refresh();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function addNote() {
    if (!note.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/retention/drivers/${data.driver.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: note,
          caseId: data.retentionCase?.id,
          author: "Admin",
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setNotes((prev) => [json.data, ...prev]);
      setNote("");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/retention"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--xxii-muted)] hover:text-[var(--xxii-blue)]"
        >
          <ArrowLeft size={16} />
          Back to Retention
        </Link>
        {message && (
          <div className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
            {message}
          </div>
        )}
      </div>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="xxii-card p-5 sm:p-6"
      >
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 to-blue-700 text-lg font-extrabold text-white shadow-lg shadow-blue-500/20">
              {data.driver.avatarInitials}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-extrabold tracking-tight">{data.driver.name}</h2>
                {atRisk && (
                  <span className="status-pill status-open">At Risk</span>
                )}
              </div>
              <p className="mt-1 text-sm text-[var(--xxii-muted)]">
                Driver ID · {data.driver.id.replace("gp-", "").toUpperCase()}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={sendSurvey}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--xxii-blue)] px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-500/25 transition hover:brightness-110 disabled:opacity-60"
          >
            <Send size={16} />
            Send Survey
          </button>
        </div>

        {surveyUrl && (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm">
            <span className="font-semibold text-slate-600">Survey link:</span>
            <a href={surveyUrl} className="font-medium text-[var(--xxii-blue)] underline" target="_blank" rel="noreferrer">
              {surveyUrl}
            </a>
            <button
              type="button"
              className="ml-auto inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-xs font-bold ring-1 ring-slate-200"
              onClick={() => navigator.clipboard.writeText(surveyUrl)}
            >
              <Copy size={12} /> Copy
            </button>
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2 border-b border-[var(--xxii-line)] pb-3">
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
                tab === t
                  ? "bg-[var(--xxii-blue)] text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {(tab === "Overview" || tab === "Survey History" || tab === "Notes") && (
          <div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-5">
              {tab === "Overview" && (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {info.map((item) => (
                      <div
                        key={item.label}
                        className="rounded-xl border border-[var(--xxii-line)] bg-slate-50/70 px-3.5 py-3"
                      >
                        <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--xxii-muted)]">
                          {item.icon}
                          {item.label}
                        </div>
                        <div className="text-sm font-semibold capitalize">{item.value}</div>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-2xl border border-sky-100 bg-[linear-gradient(135deg,#eff6ff,#f8fbff)] p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-sm font-bold text-sky-900">
                        Gross Profit · 6 Week Avg
                      </h3>
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                        Mock data
                      </span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <Metric label="Miles / Week" value={fmtNum(data.averages.milesPerWeek)} />
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
                          data.averages.cpm == null ? "—" : `$${data.averages.cpm.toFixed(2)}`
                        }
                      />
                    </div>
                  </div>
                </>
              )}

              {(tab === "Overview" || tab === "Survey History") && (
                <div>
                  <h3 className="mb-3 text-sm font-bold">Recent Survey History</h3>
                  <div className="overflow-hidden rounded-xl border border-[var(--xxii-line)]">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-50 text-xs uppercase text-[var(--xxii-muted)]">
                        <tr>
                          <th className="px-4 py-2.5 text-left">Date</th>
                          <th className="px-4 py-2.5 text-left">Rating</th>
                          <th className="px-4 py-2.5 text-left">Focus</th>
                          <th className="px-4 py-2.5 text-left">Comment</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.responses.map((r) => (
                          <tr key={r.id} className="border-t border-[var(--xxii-line)]">
                            <td className="px-4 py-3">
                              {new Date(r.submittedAt).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-3">
                              <Stars value={r.overallRating} size="sm" />
                            </td>
                            <td className="px-4 py-3">
                              {r.departmentFeedback
                                ?.filter((d) => d.rating <= 3)
                                .sort((a, b) => a.rating - b.rating)[0]?.department || "—"}
                            </td>
                            <td className="max-w-[280px] truncate px-4 py-3 text-slate-600">
                              {r.generalComment || "—"}
                            </td>
                          </tr>
                        ))}
                        {!data.responses.length && (
                          <tr>
                            <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                              No surveys yet
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-5">
              {data.retentionCase && (
                <div className="rounded-2xl border border-[var(--xxii-line)] p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-bold">Case Status</h3>
                    <StatusPill status={status} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(["Open", "In Progress", "Resolved"] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        disabled={busy}
                        onClick={() => saveStatus(s)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-bold ring-1 transition ${
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
              )}

              {(tab === "Overview" || tab === "Notes") && (
                <div className="rounded-2xl border border-[var(--xxii-line)] p-4">
                  <h3 className="mb-3 text-sm font-bold">Internal Notes</h3>
                  <div className="mb-3 space-y-3 max-h-64 overflow-auto pr-1">
                    {notes.map((n) => (
                      <div key={n.id} className="rounded-xl bg-slate-50 px-3 py-2.5">
                        <div className="mb-1 flex items-center justify-between gap-2 text-xs text-[var(--xxii-muted)]">
                          <span className="font-bold text-slate-700">{n.author}</span>
                          <span>{new Date(n.createdAt).toLocaleString()}</span>
                        </div>
                        <p className="text-sm text-slate-700">{n.text}</p>
                      </div>
                    ))}
                    {!notes.length && (
                      <p className="text-sm text-slate-400">No notes yet.</p>
                    )}
                  </div>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Add an internal note (not visible to driver)..."
                    className="min-h-20 w-full rounded-xl border border-[var(--xxii-line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--xxii-blue)]"
                  />
                  <button
                    type="button"
                    disabled={busy || !note.trim()}
                    onClick={addNote}
                    className="mt-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                  >
                    Save Note
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {(tab === "Follow-ups" || tab === "Documents") && (
          <div className="py-16 text-center text-sm text-[var(--xxii-muted)]">
            {tab} UI placeholder — wire in Day 6–7 of the plan.
          </div>
        )}
      </motion.section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/80 px-3 py-3 ring-1 ring-sky-100">
      <div className="text-[11px] font-bold uppercase tracking-wide text-sky-700/70">
        {label}
      </div>
      <div className="mt-1 text-xl font-extrabold text-slate-900">{value}</div>
    </div>
  );
}

function fmtNum(n: number | null) {
  if (n == null) return "—";
  return n.toLocaleString();
}

function fmtMoney(n: number | null) {
  if (n == null) return "—";
  return `$${n.toLocaleString()}`;
}
