"use client";

import { useState, type ReactNode } from "react";
import { X } from "lucide-react";

function todayYmd(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const inputClass =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--xxii-brand,#1e4d9c)]";

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

export function ManualDetentionDialog({
  dispatchers,
  onClose,
  onCreated,
}: {
  dispatchers: string[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [customer, setCustomer] = useState("");
  const [dispatcher, setDispatcher] = useState("");
  const [loadNumber, setLoadNumber] = useState("");
  const [driverName, setDriverName] = useState("");
  const [puLocation, setPuLocation] = useState("");
  const [puAppt, setPuAppt] = useState("");
  const [delLocation, setDelLocation] = useState("");
  const [emailDate, setEmailDate] = useState(todayYmd);
  const [timeLabel, setTimeLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/detention", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer,
          dispatcher,
          loadNumber,
          driverName,
          puLocation,
          puAppt,
          delLocation,
          emailDate,
          timeLabel,
          amount,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Could not add detention");
      }
      onCreated(String(json.data.detention.id));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-3 sm:items-center">
      <form
        onSubmit={submit}
        className="xxii-card max-h-[92vh] w-full max-w-2xl overflow-y-auto p-4 sm:p-5"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Add detention
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              For a claim that did not come in on an automatic detention email.
              Email date defaults to today.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Customer">
            <input
              required
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Dispatcher">
            <input
              required
              list="manual-detention-dispatchers"
              value={dispatcher}
              onChange={(e) => setDispatcher(e.target.value)}
              className={inputClass}
            />
            <datalist id="manual-detention-dispatchers">
              {dispatchers.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </Field>
          <Field label="Load #">
            <input
              required
              value={loadNumber}
              onChange={(e) => setLoadNumber(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Driver">
            <input
              required
              value={driverName}
              onChange={(e) => setDriverName(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="PU">
            <input
              value={puLocation}
              onChange={(e) => setPuLocation(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="PU Appt">
            <input
              value={puAppt}
              onChange={(e) => setPuAppt(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="DEL">
            <input
              value={delLocation}
              onChange={(e) => setDelLocation(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Email date">
            <input
              required
              type="date"
              value={emailDate}
              onChange={(e) => setEmailDate(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Time">
            <input
              value={timeLabel}
              onChange={(e) => setTimeLabel(e.target.value)}
              placeholder="90 or 1:30 or 2h"
              className={inputClass}
            />
          </Field>
          <Field label="Amount">
            <input
              required
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        {error ? (
          <p className="mt-3 text-sm text-rose-600">{error}</p>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-[var(--xxii-brand,#1e4d9c)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : "Add detention"}
          </button>
        </div>
      </form>
    </div>
  );
}
