"use client";

import { useEffect } from "react";
import { MESSAGE_TEMPLATES, type MessageTemplateId } from "@/lib/retention/messages";

export function ConfigureMessagesPanel({
  focusId,
  onBack,
}: {
  focusId?: MessageTemplateId | null;
  onBack: () => void;
}) {
  useEffect(() => {
    if (!focusId) return;
    const el = document.getElementById(`msg-${focusId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focusId]);

  return (
    <div className="w-full min-w-0 max-w-full space-y-4 overflow-x-hidden">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="mb-2 text-xs font-semibold text-[var(--xxii-blue)] hover:underline"
          >
            ← Back to overview
          </button>
          <h2 className="text-lg font-extrabold tracking-tight text-[var(--xxii-text)] sm:text-xl">
            Configure — message texts
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-[var(--xxii-muted)]">
            These are the SMS bodies Retention sends to drivers (birthday wishes,
            anniversary, holidays, survey invites, reminders, and post-resolve
            follow-ups). Placeholders like{" "}
            <code className="rounded bg-slate-100 px-1 text-xs">{"{FirstName}"}</code>{" "}
            and{" "}
            <code className="rounded bg-slate-100 px-1 text-xs">{"{surveyUrl}"}</code>{" "}
            are filled in when a message is sent.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {MESSAGE_TEMPLATES.map((tpl) => (
          <section
            key={tpl.id}
            id={`msg-${tpl.id}`}
            className="xxii-card scroll-mt-24 overflow-hidden"
          >
            <div className="border-b border-[var(--xxii-line)] bg-slate-50/80 px-4 py-3 sm:px-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-extrabold text-[var(--xxii-text)]">
                  {tpl.title}
                </h3>
                <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-700 ring-1 ring-sky-200">
                  {tpl.channel}
                </span>
              </div>
              <p className="mt-1 text-xs text-[var(--xxii-muted)]">{tpl.description}</p>
            </div>
            <pre className="whitespace-pre-wrap break-words px-4 py-4 font-sans text-sm leading-relaxed text-slate-800 sm:px-5">
              {tpl.sample}
            </pre>
          </section>
        ))}
      </div>
    </div>
  );
}
