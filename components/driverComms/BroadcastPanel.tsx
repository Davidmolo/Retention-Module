"use client";

import { useState } from "react";
import Link from "next/link";

export function BroadcastPanel() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!text.trim() || busy) return;
    if (
      !window.confirm(
        "Send this SMS to all active OpenRoad drivers with a phone number (excluding opt-outs)?"
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/driver-comms/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim() }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Broadcast failed");
      const d = json.data;
      setResult(
        `Sent ${d.sent} · skipped (opt-out) ${d.skipped} · failed ${d.failed} (of ${d.totalTargets} with phones)`
      );
      if (!d.failed) setText("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <Link
          href="/driver-comms"
          className="text-sm font-semibold text-[var(--xxii-blue)] hover:underline"
        >
          ← Back to inbox
        </Link>
        <div className="mt-3 text-xs font-bold uppercase tracking-[0.14em] text-[var(--xxii-muted)]">
          Driver communication
        </div>
        <h1 className="mt-1 text-xl font-extrabold tracking-tight text-[var(--xxii-text)] sm:text-2xl">
          Fleet broadcast
        </h1>
        <p className="mt-1 text-sm text-[var(--xxii-muted)]">
          Send one notice to every active driver (OpenRoad roster) through XXII
          Century GHL. Each send is logged on the driver’s SMS thread.
        </p>
      </div>

      <section className="xxii-card space-y-4 p-4 sm:p-5">
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[var(--xxii-muted)]">
            Message
          </span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder="Type the fleet-wide message…"
            className="w-full rounded-xl border border-[var(--xxii-line)] bg-white px-3 py-2.5 text-sm text-[var(--xxii-text)] outline-none focus:border-[var(--xxii-blue)]"
          />
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void send()}
            disabled={busy || !text.trim()}
            className="rounded-xl bg-[var(--xxii-blue)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? "Sending…" : "Send to all active drivers"}
          </button>
          <span className="text-xs text-[var(--xxii-muted)]">
            Opted-out phones are skipped automatically.
          </span>
        </div>

        {error ? (
          <p className="text-sm font-medium text-rose-600">{error}</p>
        ) : null}
        {result ? (
          <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 ring-1 ring-emerald-200">
            {result}
          </p>
        ) : null}
      </section>
    </div>
  );
}
